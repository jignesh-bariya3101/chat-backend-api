import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { existsSync, readFileSync } from 'fs';

const CHATS = 'chats';
const MESSAGES = 'messages';
const LAST_SEEN = 'lastSeen';

type ServiceAccountFile = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type MessageRecord = {
  senderId: number;
  text: string;
  sentAt: admin.firestore.Timestamp;
  editedAt: admin.firestore.Timestamp | null;
  deleted?: boolean;
  readBy?: Record<string, admin.firestore.Timestamp>;
};

export type ReadReceipt = {
  userId: number;
  readAt: string;
};

export type ChatMessage = {
  messageId: string;
  chatId: number;
  senderId: number;
  text: string;
  sentAt: string;
  editedAt: string | null;
  deleted: boolean;
  readBy: ReadReceipt[];
};

@Injectable()
export class FirestoreService implements OnModuleInit {
  private readonly logger = new Logger(FirestoreService.name);
  private db: admin.firestore.Firestore | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const emulatorHost = this.config.get<string>('FIRESTORE_EMULATOR_HOST');
    if (emulatorHost) {
      process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID') || 'chat-local';
      if (!admin.apps.length) {
        admin.initializeApp({ projectId });
      }
      this.db = admin.firestore();
      this.applySettings();
      this.logger.log(`Using Firestore emulator at ${emulatorHost}`);
      return;
    }

    const cred = this.readCredential();
    if (!cred) {
      this.logger.warn('Firebase is not configured. Message routes will return 503 until a service account is added.');
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }

    this.db = admin.firestore();
    this.applySettings();
    this.logger.log(`Firestore ready (${cred.projectId})`);
  }

  async addMessage(chatId: number, senderId: number, text: string): Promise<ChatMessage> {
    const sentAt = admin.firestore.Timestamp.now();
    const ref = this.messages(chatId).doc();
    const record: MessageRecord = {
      senderId,
      text,
      sentAt,
      editedAt: null,
      deleted: false,
      readBy: {},
    };
    await ref.set(record);
    return this.toMessage(chatId, ref.id, record);
  }

  async listMessages(chatId: number, limit: number): Promise<ChatMessage[]> {
    const snap = await this.messages(chatId).orderBy('sentAt', 'desc').limit(limit).get();
    const rows = snap.docs.map((doc) => this.toMessage(chatId, doc.id, doc.data() as MessageRecord));
    rows.reverse();
    return rows;
  }

  async markRead(chatId: number, messageId: string, userId: number) {
    const readAt = admin.firestore.Timestamp.now();
    try {
      await this.messages(chatId).doc(messageId).update({
        [`readBy.${userId}`]: readAt,
      });
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException('Message not found');
      throw err;
    }

    const snap = await this.messages(chatId).doc(messageId).get();
    return this.toMessage(chatId, messageId, snap.data() as MessageRecord);
  }

  async updateLastSeen(chatId: number, userId: number, messageId: string) {
    const snap = await this.messages(chatId).doc(messageId).get();
    if (!snap.exists) throw new NotFoundException('Message not found');

    const seenAt = admin.firestore.Timestamp.now();
    await this.lastSeen(chatId).doc(String(userId)).set(
      { userId, messageId, seenAt },
      { merge: true },
    );

    return {
      chatId,
      userId,
      messageId,
      seenAt: seenAt.toDate().toISOString(),
    };
  }

  async editMessage(chatId: number, messageId: string, senderId: number, text: string): Promise<ChatMessage> {
    const ref = this.messages(chatId).doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Message not found');

    const record = snap.data() as MessageRecord;
    this.assertSender(record, senderId, 'Only the sender can edit this message');
    if (record.deleted) throw new BadRequestException('Message is deleted');

    const editedAt = admin.firestore.Timestamp.now();
    await ref.update({ text, editedAt });
    return this.toMessage(chatId, messageId, { ...record, text, editedAt });
  }

  async deleteMessage(chatId: number, messageId: string, senderId: number): Promise<ChatMessage> {
    const ref = this.messages(chatId).doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Message not found');

    const record = snap.data() as MessageRecord;
    this.assertSender(record, senderId, 'Only the sender can delete this message');
    if (record.deleted) return this.toMessage(chatId, messageId, record);

    const next: MessageRecord = { ...record, text: '', deleted: true };
    await ref.update({ text: '', deleted: true });
    return this.toMessage(chatId, messageId, next);
  }

  private messages(chatId: number) {
    return this.getDb().collection(CHATS).doc(String(chatId)).collection(MESSAGES);
  }

  private lastSeen(chatId: number) {
    return this.getDb().collection(CHATS).doc(String(chatId)).collection(LAST_SEEN);
  }

  private getDb(): admin.firestore.Firestore {
    if (!this.db) {
      throw new ServiceUnavailableException(
        'Firestore is not configured. Add the Firebase service account and restart the API.',
      );
    }
    return this.db;
  }

  private assertSender(record: MessageRecord, senderId: number, message: string) {
    if (Number(record.senderId) !== senderId) {
      throw new ForbiddenException(message);
    }
  }

  private applySettings() {
    if (!this.db) return;
    try {
      this.db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() can only be called once per process (watch mode restarts the module)
    }
  }

  private readCredential(): admin.ServiceAccount | null {
    const filePath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (filePath) {
      if (!existsSync(filePath)) {
        this.logger.warn(`Firebase file not found: ${filePath}`);
      } else {
        const raw = JSON.parse(readFileSync(filePath, 'utf8')) as ServiceAccountFile;
        return {
          projectId: raw.project_id,
          clientEmail: raw.client_email,
          privateKey: raw.private_key,
        };
      }
    }

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');
    if (projectId && clientEmail && privateKey) {
      return {
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      };
    }

    return null;
  }

  private toMessage(chatId: number, messageId: string, record: MessageRecord): ChatMessage {
    return {
      messageId,
      chatId,
      senderId: Number(record.senderId),
      text: record.deleted ? '' : record.text,
      sentAt: record.sentAt.toDate().toISOString(),
      editedAt: record.editedAt ? record.editedAt.toDate().toISOString() : null,
      deleted: record.deleted === true,
      readBy: mapReads(record.readBy),
    };
  }
}

function mapReads(readBy: MessageRecord['readBy']): ReadReceipt[] {
  if (!readBy) return [];
  const rows: ReadReceipt[] = [];
  for (const [key, value] of Object.entries(readBy)) {
    const userId = Number(key);
    if (!Number.isInteger(userId) || !value || typeof value.toDate !== 'function') continue;
    rows.push({ userId, readAt: value.toDate().toISOString() });
  }
  rows.sort((a, b) => a.userId - b.userId);
  return rows;
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number | string }).code;
  return code === 5 || code === 'not-found' || code === 'NOT_FOUND';
}
