const base = process.env.API_BASE || 'http://127.0.0.1:3000';
const stamp = Date.now();
const failures = [];

async function hit(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(name, cond, detail) {
  if (cond) {
    console.log('ok  ' + name);
    return;
  }
  failures.push(name + (detail ? ' :: ' + detail : ''));
  console.log('FAIL ' + name + (detail ? ' :: ' + detail : ''));
}

const health = await hit('GET', '/health');
check('health', health.status === 200 && health.json.success === true, health.status);

const badUser = await hit('POST', '/user', { fullName: 'A', email: 'nope' });
check('reject bad user', badUser.status === 400 && badUser.json.success === false, badUser.status);

const userA = await hit('POST', '/user', { fullName: 'Jignesh', email: `api-test-a-${stamp}@mail.com` });
const userB = await hit('POST', '/user', { fullName: 'Asha', email: `api-test-b-${stamp}@mail.com` });
const userC = await hit('POST', '/user', { fullName: 'Ravi', email: `api-test-c-${stamp}@mail.com` });
check('create users', userA.status === 201 && userB.status === 201 && userC.status === 201, `${userA.status} ${userB.status} ${userC.status}`);

const idA = userA.json.data.id;
const idB = userB.json.data.id;
const idC = userC.json.data.id;

const dup = await hit('POST', '/user', { fullName: 'Jignesh', email: `api-test-a-${stamp}@mail.com` });
check('duplicate email', dup.status === 409, dup.status);

const missingUser = await hit('GET', '/user/999999');
check('missing user', missingUser.status === 404, missingUser.status);

const sameUser = await hit('POST', '/chat/create', { userAId: idA, userBId: idA });
check('direct chat needs two users', sameUser.status === 400, sameUser.status);

const created = await hit('POST', '/chat/create', { userAId: idA, userBId: idB });
check('create direct chat', created.status === 200 && created.json.data.created === true, JSON.stringify(created.json));
const chatId = created.json?.data?.chatId;

const again = await hit('POST', '/chat/create', { userAId: idB, userBId: idA });
check('same pair returns same chat', again.status === 200 && again.json.data.chatId === chatId && again.json.data.created === false, JSON.stringify(again.json));

const list = await hit('GET', `/user/${idA}/chats`);
check(
  'list chats from mysql',
  list.status === 200 && list.json.data.some((row) => row.chatId === chatId && row.memberIds.includes(idA) && row.memberIds.includes(idB)),
  JSON.stringify(list.json),
);

const group = await hit('POST', '/chat/group', { creatorId: idA, title: 'Team', memberIds: [idB, idC] });
check('create group', group.status === 201 && group.json.data.memberIds.length === 3, JSON.stringify(group.json));
const groupId = group.json?.data?.chatId;

const userD = await hit('POST', '/user', { fullName: 'Neel', email: `api-test-d-${stamp}@mail.com` });
const idD = userD.json.data.id;
const added = await hit('POST', `/chat/${groupId}/members`, { userId: idD });
check('add group member', added.status === 201, added.status);
const addedAgain = await hit('POST', `/chat/${groupId}/members`, { userId: idD });
check('duplicate member', addedAgain.status === 409, addedAgain.status);
const directAdd = await hit('POST', `/chat/${chatId}/members`, { userId: idD });
check('cannot add to direct chat', directAdd.status === 400, directAdd.status);
const removed = await hit('DELETE', `/chat/${groupId}/members/${idD}`);
check('remove group member', removed.status === 200, removed.status);

const outsider = await hit('POST', `/chat/${chatId}/message/send`, { senderId: idC, text: 'nope' });
check('outsider cannot send', outsider.status === 403, outsider.status);

const missingChat = await hit('GET', '/chat/999999/messages');
check('missing chat', missingChat.status === 404, missingChat.status);

const badLimit = await hit('GET', `/chat/${chatId}/messages?limit=500`);
check('limit max 100', badLimit.status === 400, badLimit.status);

const send = await hit('POST', `/chat/${chatId}/message/send`, { senderId: idA, text: 'first' });
if (send.status === 503) {
  console.log('SKIP firestore message flow. Service account file is not configured.');
  check('firestore not configured returns 503', send.json.success === false, JSON.stringify(send.json));
} else {
  check('send first message', send.status === 201 && send.json.data.text === 'first', JSON.stringify(send.json));
  const firstId = send.json.data.messageId;

  const second = await hit('POST', `/chat/${chatId}/message/send`, { senderId: idB, text: 'second' });
  check('send second message', second.status === 201, second.status);
  const secondId = second.json.data.messageId;

  const messages = await hit('GET', `/chat/${chatId}/messages?limit=50`);
  const ids = Array.isArray(messages.json.data) ? messages.json.data.map((row) => row.messageId) : [];
  check('messages ordered oldest first', messages.status === 200 && ids[0] === firstId && ids[1] === secondId, JSON.stringify(messages.json));

  const read = await hit('POST', `/chat/${chatId}/message/${firstId}/read`, { userId: idB });
  check('mark read', read.status === 200 && read.json.data.userId === idB, JSON.stringify(read.json));

  const afterRead = await hit('GET', `/chat/${chatId}/messages?limit=50`);
  const firstRow = afterRead.json.data.find((row) => row.messageId === firstId);
  check('read receipt stored on message', firstRow && firstRow.readBy.some((row) => row.userId === idB), JSON.stringify(firstRow));

  const seen = await hit('POST', `/chat/${chatId}/lastseen`, { userId: idB, messageId: secondId });
  check('last seen', seen.status === 200 && seen.json.data.messageId === secondId, JSON.stringify(seen.json));

  const badSeen = await hit('POST', `/chat/${chatId}/lastseen`, { userId: idB, messageId: 'missing-message-id' });
  check('last seen missing message', badSeen.status === 404, badSeen.status);

  const edited = await hit('PATCH', `/chat/${chatId}/message/${firstId}`, { senderId: idA, text: 'first edited' });
  check('edit message', edited.status === 200 && edited.json.data.text === 'first edited' && edited.json.data.editedAt, JSON.stringify(edited.json));

  const editOther = await hit('PATCH', `/chat/${chatId}/message/${firstId}`, { senderId: idB, text: 'stolen' });
  check('other user cannot edit', editOther.status === 403, editOther.status);

  const deleted = await hit('DELETE', `/chat/${chatId}/message/${firstId}`, { senderId: idA });
  check('delete message', deleted.status === 200 && deleted.json.data.deleted === true && deleted.json.data.text === '', JSON.stringify(deleted.json));
}

if (failures.length) {
  console.log('\n' + failures.length + ' failed');
  process.exit(1);
}

console.log('\npassed');
