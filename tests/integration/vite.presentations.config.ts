import config from '../../vite.config';

// Stable browser qualification must not restart an active animation on file edits.
export default { ...config, server: { hmr: false } };
