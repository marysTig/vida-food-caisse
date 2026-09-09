import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marystig.vidafoodcaisse',
  appName: 'vida-food-caisse',
  webDir: '.output/public',
  server: {
    url: 'https://vida-food-caisse.vercel.app/',
    allowNavigation: ['vida-food-caisse.vercel.app', '*.vercel.app']
  }
};

export default config;
