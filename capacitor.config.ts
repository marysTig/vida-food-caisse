import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marystig.vidafoodcaisse',
  appName: 'vida-food-caisse',
  webDir: '.output/public',
  server: {
    url: 'http://192.168.100.6:8080',
    cleartext: true
  }
};

export default config;
