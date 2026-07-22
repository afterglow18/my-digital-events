import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalevents.app',
  appName: 'My Events',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F9F4EE',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,

    // Privacy usage descriptions — iOS refuses camera/picker access (SIGABRT via
    // TCC) if any of these three keys is missing from Info.plist.
    // NSPhotoLibraryAddUsageDescription is required when the Camera plugin saves
    // a captured photo back to the device library (commonly overlooked).
    infoPlist: {
      NSCameraUsageDescription:
        'My Events uses your camera to photograph outfits and event looks.',
      NSPhotoLibraryUsageDescription:
        'My Events reads your photo library so you can choose existing photos for your wardrobe.',
      NSPhotoLibraryAddUsageDescription:
        'My Events saves photos you take directly to your library.',
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F9F4EE',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F4EE',
      overlaysWebView: true,
    },
  },
};

export default config;
