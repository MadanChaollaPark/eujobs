import './env';
import { getDb, getStats } from '../src/lib/store';

getDb();
console.log('Database initialized. Existing records are preserved.');
console.log(getStats());
