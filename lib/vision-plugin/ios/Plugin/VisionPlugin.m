#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers VisionPlugin with Capacitor's plugin registry so it can be
// called from JavaScript via registerPlugin("VisionPlugin").
CAP_PLUGIN(VisionPlugin, "VisionPlugin",
    CAP_PLUGIN_METHOD(analyze, CAPPluginReturnPromise);
)
