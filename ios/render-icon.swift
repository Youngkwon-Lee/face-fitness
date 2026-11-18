// Deterministic original vector artwork; no third-party logo or SF Symbol glyph.
import AppKit
import Foundation

let target = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
    bytesPerRow: 4096, space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(red: 0.063, green: 0.059, blue: 0.125, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
context.setStrokeColor(CGColor(red: 0.749, green: 0.702, blue: 1, alpha: 1))
context.setLineWidth(38)
context.strokeEllipse(in: CGRect(x: 232, y: 192, width: 560, height: 650))
func stroke(_ start: CGPoint, _ end: CGPoint, _ c1: CGPoint, _ c2: CGPoint, width: CGFloat) {
    context.beginPath(); context.move(to: start)
    context.addCurve(to: end, control1: c1, control2: c2)
    context.setLineWidth(width); context.setLineCap(.round); context.strokePath()
}
stroke(CGPoint(x: 342, y: 560), CGPoint(x: 442, y: 560), CGPoint(x: 368, y: 585), CGPoint(x: 416, y: 585), width: 26)
stroke(CGPoint(x: 582, y: 560), CGPoint(x: 682, y: 560), CGPoint(x: 608, y: 585), CGPoint(x: 656, y: 585), width: 26)
stroke(CGPoint(x: 390, y: 407), CGPoint(x: 634, y: 407), CGPoint(x: 451, y: 324), CGPoint(x: 573, y: 324), width: 30)
context.setFillColor(CGColor(red: 0.956, green: 0.635, blue: 0.741, alpha: 1))
context.fillEllipse(in: CGRect(x: 706, y: 736, width: 94, height: 94))
let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
try bitmap.representation(using: .png, properties: [:])!.write(to: target.appendingPathComponent("AppIcon.png"))
let manifest: [String: Any] = [
    "images": [["filename": "AppIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]],
    "info": ["author": "xcode", "version": 1]
]
try JSONSerialization.data(withJSONObject: manifest, options: .prettyPrinted).write(to: target.appendingPathComponent("Contents.json"))
