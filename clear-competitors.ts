
import { storage } from './server/storage.js';

async function clearCompetitorsForUser() {
  const userId = '39003547'; // Your user ID from the logs
  
  console.log('Clearing tracked competitors for user:', userId);
  
  try {
    // Get current count before clearing
    const currentCount = await storage.getTrackedCompetitorCount(userId);
    console.log('Current tracked competitors:', currentCount);
    
    // Clear all tracked competitors
    await storage.clearAllTrackedCompetitors(userId);
    
    // Verify they're cleared
    const newCount = await storage.getTrackedCompetitorCount(userId);
    console.log('Tracked competitors after clearing:', newCount);
    
    console.log('✅ Successfully cleared all tracked competitors!');
  } catch (error) {
    console.error('❌ Error clearing competitors:', error);
  }
  
  process.exit(0);
}

clearCompetitorsForUser();
