# chat-backend-api

Users and chats are in MySQL. Messages, read receipts and last seen are in Firestore.

There is no login. The caller sends the user id. Do not put this on the public internet.

Limits are per IP and kept in memory on this one process. 60 requests a minute, 8 for `POST /user`, 15 for `POST /chat/create`, 10 for `POST /chat/group`, 30 for sending a message. `GET /health` is not counted. Past that the API returns 429. Helmet is enabled. Someone who is not in the chat cannot send, edit, delete, mark read, or set last seen.

## Run locally

Node 20+ and MySQL. `.env.example` points at `127.0.0.1`, user `root`, password `root`, database `create_new`.

```bash
copy .env.example .env
npm install
npm run db:create
npm run migration:run
npm run start:dev
```

On macOS or Linux use `cp` instead of `copy`.

`db:create` creates the database in `DATABASE_URL` if it is missing. `migration:run` is `prisma migrate deploy`. Applied migrations are recorded in `_prisma_migrations`.

API: http://localhost:3000

`package.json` allows the Prisma install scripts. `npm run build` also runs `prisma generate`.

## Firebase

The API uses the Admin SDK. You do not create collections. The first message write creates them. Firestore security rules do not apply to the Admin SDK.

1. Open https://console.firebase.google.com and create a project, or use one you already have.
2. Build -> Firestore Database -> Create database. Pick a region. Native mode. Production mode is fine.
3. Project settings -> Service accounts -> Generate new private key.
4. Save that json as `secrets/firebase-service-account.json`. Json files in `secrets/` are gitignored. Do not commit the key.
5. `.env` already has `FIREBASE_SERVICE_ACCOUNT_PATH` set to that file. Restart the API.

Until the file is there, user and chat routes still work. Send, read, and last seen return 503.

Stored data:

- `chats/{chatId}/messages/{messageId}` has `senderId`, `text`, `sentAt`, `editedAt`, `deleted`, and `readBy.{userId}`
- `chats/{chatId}/lastSeen/{userId}` has `userId`, `messageId`, `seenAt`

A read receipt is one user opening one message. Last seen is the latest message id that user has reached in the chat. The client calls last seen when they scroll. `sentAt` is set on the server.

`GET /chat/:chatId/messages` returns the latest `limit` messages, oldest first. Default 50, max 100. That query does not need a composite index.

Docker reads the same `secrets/firebase-service-account.json`. Do not put the private key in `.env`.

For the Firestore emulator, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_PROJECT_ID=chat-local`.

## Docker

```bash
docker compose up --build
```

Compose starts MySQL itself. A local MySQL install is not required.

- API: http://localhost:3000
- Compose MySQL: `127.0.0.1` port `3307`, user `root`, password `root`, database `create_new`
- Local MySQL on port 3306 is not used by Compose
- `npm run start:dev` also uses port 3000, so run only one of them

The api container waits for MySQL, runs `prisma migrate deploy`, then listens. Later starts only apply new migrations.

Put `secrets/firebase-service-account.json` in place before `docker compose up` if you want messages. Without it the API still starts and message routes return 503.

If migrate says the database is not empty, the volume is from an older copy of this project:

```bash
docker compose down -v
docker compose up --build
```

## Postman

Import `postman/Chat Backend API.postman_collection.json` and `postman/Local.postman_environment.json`, then select Local.

The environment is filled for the users already in the local database: Jignesh `5`, Rahul `6`, Mahesh `7`, direct chat `3`, group chat `4`. Run the folder from the top on a fresh database so the requests store the new ids.

## APIs

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "message": "Chat not found", "statusCode": 404 }
```

### Users

`POST /user`

```json
{ "fullName": "Jignesh", "email": "jignesh@mail.com" }
```

`GET /user` returns `id`, `fullName`, `email`. Use an id from here with `POST /chat/create`.

`GET /user/:userId`

### Direct chat

`POST /chat/create`

```json
{ "userAId": 1, "userBId": 2 }
```

Returns `chatId`, `members` (`userId`, `fullName`), `memberIds`, and `created`. The same pair returns the existing chat with `created: false`.

`GET /chat/:chatId` returns that chat.

### Group

`POST /chat/group`

```json
{ "creatorId": 1, "title": "Team", "memberIds": [2, 3] }
```

`POST /chat/:chatId/members`

```json
{ "userId": 4 }
```

`DELETE /chat/:chatId/members/:userId`

Direct chats cannot gain or lose members. A group stays at two or more.

### Messages

`POST /chat/:chatId/message/send`

```json
{ "senderId": 1, "text": "hello" }
```

The sender has to be a member. The response includes `senderName`.

`GET /chat/:chatId/messages?limit=50`

`readBy` is `{ userId, fullName, readAt }`. The sender is not counted. `readerCount` is the other members. `readCount` is how many of them have read it. `readByAll` is true when `readCount` equals `readerCount`.

`POST /chat/:chatId/message/:messageId/read`

```json
{ "userId": 2 }
```

Returns that user's name and `readAt`, plus the same `readBy`, `readCount`, `readerCount`, and `readByAll`.

`POST /chat/:chatId/lastseen`

```json
{ "userId": 2, "messageId": "<firestore message id>" }
```

`messageId` has to exist in that chat. This does not change `readBy`.

### Edit / delete

`PATCH /chat/:chatId/message/:messageId`

```json
{ "senderId": 1, "text": "hello again" }
```

`DELETE /chat/:chatId/message/:messageId`

```json
{ "senderId": 1 }
```

Only the sender. Delete clears `text` and sets `deleted: true`. The row stays so the order does not change.

### List chats

`GET /user/:userId/chats`

Each row has `chatId`, `type`, `title`, `createdBy`, `createdByName`, `memberIds`, and `members`.

### Health

`GET /health`
