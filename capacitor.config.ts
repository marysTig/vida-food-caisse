import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marystig.vidafoodcaisse',
  appName: 'vida-food-caisse',
  webDir: '.output/public',
  server: {
    // Tablet WebView must match the production admin host with 2-slot UI
    url: 'https://vida-food-caisse.vercel.app/',
    allowNavigation: [
      'vida-food-caisse.vercel.app',
      'vida-food-caisse-livid.vercel.app',
      '*.vercel.app',
    ],
  }
};

export default config;
