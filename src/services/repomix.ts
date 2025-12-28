import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { RepoProcessResult, CachedRepo, RepoMetadata } from '../types/index.js';

const execAsync = promisify(exec);

export class RepomixService {
  private tempDir: string;
  private cacheDir: string;

  constructor() {
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.cacheDir = process.env.CACHE_DIR || './cache';
  }

  /**
   * Initialize required directories
   */
  async init(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Get the latest commit SHA from GitHub API without cloning
   */
  async getLatestCommitShaFromGithub(repoUrl: string): Promise<string> {
    try {
      // Extract owner and repo from URL
      // e.g., https://github.com/owner/repo -> owner/repo
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) throw new Error('Invalid GitHub URL');

      const [, owner, repo] = match;
      const cleanRepo = repo.replace('.git', '');

      // Use GitHub API to get latest commit
      const apiUrl = `https://api.github.com/repos/${owner}/${cleanRepo}/commits/main`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        // Try 'master' branch if 'main' fails
        const masterResponse = await fetch(
          `https://api.github.com/repos/${owner}/${cleanRepo}/commits/master`
        );
        if (!masterResponse.ok) {
          throw new Error('Could not fetch commit info from GitHub');
        }
        const data = await masterResponse.json();
        return data.sha;
      }

      const data = await response.json();
      return data.sha;
    } catch (error) {
      console.warn('Could not get commit SHA from GitHub API:', error);
      return 'latest';
    }
  }

  /**
   * Generate a cache key from repo URL and commit SHA
   */
  generateCacheKey(repoUrl: string, commitSha: string = 'latest'): string {
    const combined = `${repoUrl}:${commitSha}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Clone a GitHub repository to temp directory
   */
  async cloneRepo(repoUrl: string): Promise<string> {
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
    const timestamp = Date.now();
    const repoPath = path.join(this.tempDir, `${repoName}-${timestamp}`);

    try {
      console.log(`Cloning ${repoUrl} to ${repoPath}...`);
      await execAsync(`git clone --depth 1 ${repoUrl} ${repoPath}`);
      return repoPath;
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the latest commit SHA from a cloned repo
   */
  async getCommitSha(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git -C ${repoPath} rev-parse HEAD`);
      return stdout.trim();
    } catch (error) {
      console.warn('Could not get commit SHA:', error instanceof Error ? error.message : 'Unknown error');
      return 'latest';
    }
  }

  /**
   * Run repomix CLI on a repository
   */
  async packRepo(repoPath: string): Promise<string> {
    try {
      const outputPath = path.join(repoPath, 'repomix-output.txt');

      console.log(`Running repomix on ${repoPath}...`);

      // Run repomix - assumes it's globally installed
      await execAsync(`repomix ${repoPath} -o ${outputPath}`);

      // Check if output was created
      await fs.access(outputPath);

      return outputPath;
    } catch (error) {
      throw new Error(`Failed to pack repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read packed repo content
   */
  async readPackedRepo(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read packed repo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save packed content to cache
   */
  async saveToCache(
    cacheKey: string,
    content: string,
    metadata: Partial<RepoMetadata> = {}
  ): Promise<string> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.txt`);
    const metadataPath = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      await fs.writeFile(cachePath, content, 'utf-8');

      const fullMetadata: RepoMetadata = {
        repoUrl: metadata.repoUrl || '',
        commitSha: metadata.commitSha || '',
        size: content.length,
        cachedAt: new Date().toISOString()
      };

      await fs.writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

      return cachePath;
    } catch (error) {
      throw new Error(`Failed to save to cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load from cache
   */
  async loadFromCache(cacheKey: string): Promise<CachedRepo | null> {
    const cachePath = path.join(this.cacheDir, `${cacheKey}.txt`);
    const metadataPath = path.join(this.cacheDir, `${cacheKey}.json`);

    try {
      await fs.access(cachePath);
      const content = await fs.readFile(cachePath, 'utf-8');

      let metadata: RepoMetadata = {
        repoUrl: '',
        commitSha: '',
        size: content.length,
        cachedAt: new Date().toISOString()
      };

      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch {
        // Metadata file doesn't exist or is invalid
      }

      return { content, metadata };
    } catch {
      return null;
    }
  }

  /**
   * Clean up temporary directory
   */
  async cleanup(repoPath: string): Promise<void> {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      console.log(`Cleaned up ${repoPath}`);
    } catch (error) {
      console.warn(`Failed to cleanup ${repoPath}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Full workflow: clone, pack, cache
   */
  async processRepo(repoUrl: string, forceRefresh: boolean = false): Promise<RepoProcessResult> {
    await this.init();

    // Get commit SHA from GitHub API first (no cloning needed)
    const commitSha = await this.getLatestCommitShaFromGithub(repoUrl);
    const cacheKey = this.generateCacheKey(repoUrl, commitSha);

    // Check cache BEFORE cloning unless force refresh
    if (!forceRefresh) {
      const cached = await this.loadFromCache(cacheKey);
      if (cached) {
        console.log('Using cached version');
        return {
          cacheKey,
          fromCache: true,
          ...cached.metadata
        };
      }
    }

    let repoPath: string | undefined;
    try {
      // Clone the repo
      repoPath = await this.cloneRepo(repoUrl);

      // Get commit SHA for cache key
      const commitSha = await this.getCommitSha(repoPath);
      const cacheKey = this.generateCacheKey(repoUrl, commitSha);

      // Check cache unless force refresh
      if (!forceRefresh) {
        const cached = await this.loadFromCache(cacheKey);
        if (cached) {
          console.log('Using cached version');
          await this.cleanup(repoPath);
          return {
            cacheKey,
            fromCache: true,
            ...cached.metadata
          };
        }
      }

      // Pack the repo
      const packedPath = await this.packRepo(repoPath);
      const content = await this.readPackedRepo(packedPath);

      // Save to cache
      const metadata: Partial<RepoMetadata> = {
        repoUrl,
        commitSha,
        size: content.length
      };

      await this.saveToCache(cacheKey, content, metadata);

      // Cleanup
      await this.cleanup(repoPath);

      return {
        cacheKey,
        fromCache: false,
        repoUrl,
        commitSha,
        size: content.length
      };
    } catch (error) {
      // Ensure cleanup on error
      if (repoPath) {
        await this.cleanup(repoPath);
      }
      throw error;
    }
  }
}

export default RepomixService;