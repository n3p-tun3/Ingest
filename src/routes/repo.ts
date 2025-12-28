import { Hono } from 'hono';
import fs from 'fs/promises';
import RepomixService from '../services/repomix.ts';
import type { 
  RepoPackRequest, 
  RepoPackResponse, 
  RepoStatusResponse 
} from '../types/index.ts';

const app = new Hono();

/**
 * POST /api/repo/pack
 * Manually pack a repository
 */
app.post('/pack', async (c) => {
  try {
    const body = await c.req.json() as RepoPackRequest;
    const { repoUrl, forceRefresh = false } = body;

    if (!repoUrl) {
      return c.json({ error: 'repoUrl is required' }, 400);
    }

    // Validate GitHub URL
    if (!repoUrl.includes('github.com')) {
      return c.json({ error: 'Only GitHub URLs are supported currently' }, 400);
    }

    const repomixService = new RepomixService();
    const result = await repomixService.processRepo(repoUrl, forceRefresh);

    const response: RepoPackResponse = {
      success: true,
      cacheKey: result.cacheKey,
      fromCache: result.fromCache,
      metadata: {
        repoUrl: result.repoUrl || '',
        commitSha: result.commitSha || '',
        size: result.size || 0,
        cachedAt: result.cachedAt || new Date().toISOString()
      }
    };

    return c.json(response);

  } catch (error) {
    console.error('Pack error:', error);
    const response: RepoPackResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    return c.json(response, 500);
  }
});

/**
 * GET /api/repo/status/:cacheKey
 * Check status of a cached repository
 */
app.get('/status/:cacheKey', async (c) => {
  try {
    const { cacheKey } = c.req.param();

    const repomixService = new RepomixService();
    const cached = await repomixService.loadFromCache(cacheKey);

    if (!cached) {
      const response: RepoStatusResponse = {
        exists: false,
        cacheKey
      };
      return c.json(response, 404);
    }

    const response: RepoStatusResponse = {
      exists: true,
      cacheKey,
      metadata: cached.metadata
    };

    return c.json(response);

  } catch (error) {
    console.error('Status check error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

/**
 * DELETE /api/repo/cache/:cacheKey
 * Delete a cached repository
 */
app.delete('/cache/:cacheKey', async (c) => {
  try {
    const { cacheKey } = c.req.param();
    
    const repomixService = new RepomixService();
    const cachePath = `${repomixService['cacheDir']}/${cacheKey}.txt`;
    const metadataPath = `${repomixService['cacheDir']}/${cacheKey}.json`;

    await fs.rm(cachePath, { force: true });
    await fs.rm(metadataPath, { force: true });

    return c.json({ 
      success: true,
      message: 'Cache deleted'
    });

  } catch (error) {
    console.error('Delete cache error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

export default app;