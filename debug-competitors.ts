
import { db } from './server/db.js';
import { trackedCompetitors } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function debugCompetitors() {
  const userId = '39003547';
  
  console.log('Debugging tracked competitors for user:', userId);
  
  try {
    // Get all competitors (including inactive ones)
    const allCompetitors = await db
      .select()
      .from(trackedCompetitors)
      .where(eq(trackedCompetitors.userId, userId));
    
    console.log('All competitors in database:', allCompetitors);
    
    // Get active competitors
    const activeCompetitors = allCompetitors.filter(c => c.isActive);
    console.log('Active competitors:', activeCompetitors.length);
    
    // Get inactive competitors  
    const inactiveCompetitors = allCompetitors.filter(c => !c.isActive);
    console.log('Inactive competitors:', inactiveCompetitors.length);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

debugCompetitors();
