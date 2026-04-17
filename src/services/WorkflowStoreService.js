import { MongoClient } from 'mongodb';
import config from '../config/index.js';

export class WorkflowStoreService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collectionName = 'user_workflows';
  }

  async connect() {
    if (!config.mongodbUrl) return null;
    if (this.db) return this.db;

    this.client = new MongoClient(config.mongodbUrl);
    await this.client.connect();

    if (config.mongodbDbName) {
      this.db = this.client.db(config.mongodbDbName);
    } else {
      this.db = this.client.db();
    }

    return this.db;
  }

  async upsertStage(userId, stage, payload) {
    try {
      const db = await this.connect();
      if (!db) return;

      await db.collection(this.collectionName).updateOne(
        { userId },
        {
          $set: {
            userId,
            updatedAt: new Date(),
            [`stages.${stage}`]: {
              ...payload,
              at: new Date(),
            },
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      console.log('[WorkflowStore] Skipping DB write:', error.message);
    }
  }
}

export const workflowStoreService = new WorkflowStoreService();
