import type { UserConfig } from 'vite';
import config from '../../vite.config';

// Stable browser qualification must not restart an active animation on file edits.
const presentationsConfig: UserConfig = { ...config, server: { hmr: false } };
export default presentationsConfig;
