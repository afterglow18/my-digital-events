import Foundation
import Capacitor
import Vision
import UIKit

/**
 VisionPlugin — runs Apple's Vision framework on a JPEG/PNG data-URL
 and returns:
   • labels  [String]  — VNClassifyImageRequest results (confidence > 0.15, top-10)
   • text    [String]  — VNRecognizeTextRequest results (fast mode)

 Canvas-side colour extraction still runs in parallel from JS (visionIndexer.ts),
 so colour names ("blue", "white") are added by the web layer, not here.
 */
@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyze(_ call: CAPPluginCall) {
        guard let imageDataUrl = call.getString("imageDataUrl"),
              let commaRange   = imageDataUrl.range(of: ",")
        else {
            call.reject("Missing or malformed imageDataUrl")
            return
        }

        let base64 = String(imageDataUrl[commaRange.upperBound...])
        guard let data     = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              let uiImage  = UIImage(data: data),
              let cgImage  = uiImage.cgImage
        else {
            call.reject("Could not decode imageDataUrl to a CGImage")
            return
        }

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        // Classify (object labels)
        var labels: [String] = []
        let classifyReq = VNClassifyImageRequest { req, _ in
            guard let obs = req.results as? [VNClassificationObservation] else { return }
            labels = obs
                .filter  { $0.confidence > 0.15 }
                .prefix(10)
                .map     { $0.identifier }
        }

        // Recognise text (fast pass — good enough for product labels, brand names)
        var textLines: [String] = []
        let textReq = VNRecognizeTextRequest { req, _ in
            guard let obs = req.results as? [VNRecognizedTextObservation] else { return }
            textLines = obs.compactMap { $0.topCandidates(1).first?.string }
        }
        textReq.recognitionLevel = .fast

        do {
            try handler.perform([classifyReq, textReq])
            call.resolve(["labels": labels, "text": textLines])
        } catch {
            call.reject("Vision analysis failed: \(error.localizedDescription)")
        }
    }
}
