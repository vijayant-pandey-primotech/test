import { createRequire } from 'module';
import { Firestore } from '@google-cloud/firestore';

const projectId = process.env.PROJECTID;
const require = createRequire(import.meta.url);
const serviceKey = require('../serviceKey.json');

const DBID = process.env.FIREBASE_DB

const db = new Firestore({
  projectId: projectId,
  databaseId: DBID,
  credentials: serviceKey,
  ignoreUndefinedProperties: true,
});

const userStoriesDescription = db.collection('user_stories');
const Chats = db.collection('chats');
const Messages = db.collection('messages');
const SocketUser = db.collection('socketUser');
const notifications = db.collection("notifications");
const journalAndPosts = db.collection('journal_and_posts');

export  {db,Chats,Messages,SocketUser, notifications, userStoriesDescription,journalAndPosts}