import Foundation
import UIKit

@objc(StoryPackPipeline)
class StoryPackPipeline: RCTEventEmitter {
  private let workQueue = DispatchQueue(label: "com.monmondemagique.storypack", qos: .userInitiated)
  private var downloadWakeRefCount = 0
  private var bgTaskId: UIBackgroundTaskIdentifier = .invalid

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["StoryPackNativeProgress"]
  }

  @objc func acquireDownloadWakeLock(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.downloadWakeRefCount += 1
      if self.downloadWakeRefCount == 1 {
        UIApplication.shared.isIdleTimerDisabled = true
        self.bgTaskId = UIApplication.shared.beginBackgroundTask(withName: "StoryPackDownload") { }
      }
      resolve(true)
    }
  }

  @objc func releaseDownloadWakeLock(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.downloadWakeRefCount = max(0, self.downloadWakeRefCount - 1)
      if self.downloadWakeRefCount == 0 {
        UIApplication.shared.isIdleTimerDisabled = false
        if self.bgTaskId != .invalid {
          UIApplication.shared.endBackgroundTask(self.bgTaskId)
          self.bgTaskId = .invalid
        }
      }
      resolve(true)
    }
  }

  @objc func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(true)
  }

  @objc func downloadDecryptAndUnzip(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let downloadUrl = options["downloadUrl"] as? String, !downloadUrl.isEmpty,
      let encryptedPath = options["encryptedPath"] as? String, !encryptedPath.isEmpty,
      let destDir = options["destDir"] as? String, !destDir.isEmpty,
      let keyBase64 = options["keyBase64"] as? String, !keyBase64.isEmpty
    else {
      reject("INVALID_ARGS", "Missing downloadUrl, encryptedPath, destDir or keyBase64", nil)
      return
    }

    let totalBytes = (options["totalBytes"] as? NSNumber)?.int64Value ?? 0
    let packId = (options["packId"] as? String) ?? ""

    workQueue.async {
      do {
        let destURL = URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(destDir), isDirectory: true)
        try FileManager.default.createDirectory(at: destURL, withIntermediateDirectories: true)

        let encURL = URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(encryptedPath))
        let zipURL = destURL.appendingPathComponent("pack.zip")

        self.emitProgress(packId: packId, progress: 0.05, status: "downloading", totalBytes: totalBytes, bytesWritten: 0)
        try self.downloadToFile(urlString: downloadUrl, dest: encURL, totalBytes: totalBytes, packId: packId)

        if totalBytes > 0 {
          let metaURL = destURL.appendingPathComponent(".pack.enc.meta")
          try "{\"size\":\(totalBytes)}".write(to: metaURL, atomically: true, encoding: .utf8)
        }

        self.emitProgress(packId: packId, progress: 0.58, status: "decrypting", totalBytes: totalBytes, bytesWritten: totalBytes)
        guard let keyData = Data(base64Encoded: keyBase64) else {
          throw NSError(domain: "StoryPackPipeline", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid key base64"])
        }
        let decryptor = try MegaCtrDecryptor(key: keyData)
        try decryptor.decryptFile(input: encURL, output: zipURL)
        try? FileManager.default.removeItem(at: encURL)

        self.emitProgress(packId: packId, progress: 0.86, status: "unzipping", totalBytes: totalBytes, bytesWritten: totalBytes)
        try self.unzipToDirectory(zipURL: zipURL, destURL: destURL, packId: packId)
        try? FileManager.default.removeItem(at: zipURL)

        self.emitProgress(packId: packId, progress: 1.0, status: "saving", totalBytes: totalBytes, bytesWritten: totalBytes)
        resolve(true)
      } catch {
        reject("NATIVE_PIPELINE_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func decryptToZip(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let encryptedPath = options["encryptedPath"] as? String, !encryptedPath.isEmpty,
      let zipPath = options["zipPath"] as? String, !zipPath.isEmpty,
      let keyBase64 = options["keyBase64"] as? String, !keyBase64.isEmpty
    else {
      reject("INVALID_ARGS", "Missing encryptedPath, zipPath or keyBase64", nil)
      return
    }

    let packId = (options["packId"] as? String) ?? ""

    workQueue.async {
      do {
        guard let keyData = Data(base64Encoded: keyBase64) else {
          throw NSError(domain: "StoryPackPipeline", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid key base64"])
        }
        self.emitProgress(packId: packId, progress: 0.58, status: "decrypting", totalBytes: 0, bytesWritten: 0)
        let decryptor = try MegaCtrDecryptor(key: keyData)
        try decryptor.decryptFile(
          input: URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(encryptedPath)),
          output: URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(zipPath))
        )
        self.emitProgress(packId: packId, progress: 0.86, status: "decrypting", totalBytes: 0, bytesWritten: 0)
        resolve(true)
      } catch {
        reject("NATIVE_DECRYPT_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func unzipDirectory(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let zipPath = options["zipPath"] as? String, !zipPath.isEmpty,
      let destDir = options["destDir"] as? String, !destDir.isEmpty
    else {
      reject("INVALID_ARGS", "Missing zipPath or destDir", nil)
      return
    }

    let packId = (options["packId"] as? String) ?? ""

    workQueue.async {
      do {
        self.emitProgress(packId: packId, progress: 0.86, status: "unzipping", totalBytes: 0, bytesWritten: 0)
        try self.unzipToDirectory(
          zipURL: URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(zipPath)),
          destURL: URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(destDir), isDirectory: true),
          packId: packId
        )
        self.emitProgress(packId: packId, progress: 0.98, status: "extracting", totalBytes: 0, bytesWritten: 0)
        resolve(true)
      } catch {
        reject("NATIVE_UNZIP_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func downloadFile(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let downloadUrl = options["downloadUrl"] as? String, !downloadUrl.isEmpty,
      let destPath = options["destPath"] as? String, !destPath.isEmpty
    else {
      reject("INVALID_ARGS", "Missing downloadUrl or destPath", nil)
      return
    }

    let totalBytes = (options["totalBytes"] as? NSNumber)?.int64Value ?? 0
    let packId = (options["packId"] as? String) ?? ""

    workQueue.async {
      do {
        self.emitProgress(packId: packId, progress: 0.05, status: "downloading", totalBytes: totalBytes, bytesWritten: 0)
        try self.downloadToFile(
          urlString: downloadUrl,
          dest: URL(fileURLWithPath: StoryPackPipeline.stripFileScheme(destPath)),
          totalBytes: totalBytes,
          packId: packId
        )
        self.emitProgress(packId: packId, progress: 0.55, status: "downloading", totalBytes: totalBytes, bytesWritten: totalBytes)
        resolve(true)
      } catch {
        reject("NATIVE_DOWNLOAD_FAILED", error.localizedDescription, error)
      }
    }
  }

  private func downloadToFile(urlString: String, dest: URL, totalBytes: Int64, packId: String) throws {
    try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
    FileManager.default.createFile(atPath: dest.path, contents: nil)

    let runner = DownloadRunner(
      dest: dest,
      totalBytes: totalBytes,
      packId: packId,
      emit: { [weak self] progress, total, written in
        self?.emitProgress(packId: packId, progress: progress, status: "downloading", totalBytes: total, bytesWritten: written)
      }
    )
    try runner.run(urlString: urlString)
  }

  private func unzipToDirectory(zipURL: URL, destURL: URL, packId: String) throws {
    try FileManager.default.createDirectory(at: destURL, withIntermediateDirectories: true)
    let zipSize = (try? FileManager.default.attributesOfItem(atPath: zipURL.path)[.size] as? NSNumber)?.int64Value ?? 1
    var extracted: Int64 = 0

    var error: NSError?
    let ok = SSZipArchive.unzipFile(
      atPath: zipURL.path,
      toDestination: destURL.path,
      preserveAttributes: false,
      overwrite: true,
      password: nil,
      error: &error,
      delegate: ZipProgressDelegate { written in
        extracted = written
        let progress = 0.86 + (Double(written) / Double(max(zipSize, 1))) * 0.13
        self.emitProgress(
          packId: packId,
          progress: min(progress, 0.99),
          status: "extracting",
          totalBytes: zipSize,
          bytesWritten: extracted
        )
      }
    )

    if !ok {
      throw error ?? NSError(domain: "StoryPackPipeline", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unzip failed"])
    }
  }

  private func emitProgress(packId: String, progress: Double, status: String, totalBytes: Int64, bytesWritten: Int64) {
    sendEvent(withName: "StoryPackNativeProgress", body: [
      "packId": packId,
      "progress": progress,
      "status": status,
      "totalBytes": Double(totalBytes),
      "bytesWritten": Double(bytesWritten),
    ])
  }

  private static func stripFileScheme(_ path: String) -> String {
    path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
  }
}

private final class ZipProgressDelegate: NSObject, SSZipArchiveDelegate {
  private let onProgress: (Int64) -> Void

  init(onProgress: @escaping (Int64) -> Void) {
    self.onProgress = onProgress
  }

  func zipArchiveProgressEvent(_ loaded: UInt64, total: UInt64) {
    onProgress(Int64(loaded))
  }
}

private final class DownloadRunner: NSObject, URLSessionDataDelegate {
  private let dest: URL
  private let totalBytes: Int64
  private let emit: (Double, Int64, Int64) -> Void
  private var handle: FileHandle?
  private var written: Int64 = 0
  private var expectedTotal: Int64 = 0
  private var semaphore = DispatchSemaphore(value: 0)
  private var thrown: Error?

  init(dest: URL, totalBytes: Int64, packId: String, emit: @escaping (Double, Int64, Int64) -> Void) {
    self.dest = dest
    self.totalBytes = totalBytes
    self.emit = emit
    super.init()
  }

  func run(urlString: String) throws {
    guard let url = URL(string: urlString) else {
      throw NSError(domain: "StoryPackPipeline", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid download URL"])
    }
    handle = try FileHandle(forWritingTo: dest)
    expectedTotal = totalBytes

    let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    let task = session.dataTask(with: url)
    task.resume()
    semaphore.wait()

    try? handle?.close()
    handle = nil
    if let thrown = thrown { throw thrown }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
      thrown = NSError(domain: "StoryPackPipeline", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode)"])
      completionHandler(.cancel)
      semaphore.signal()
      return
    }
    if expectedTotal <= 0, response.expectedContentLength > 0 {
      expectedTotal = response.expectedContentLength
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    handle?.write(data)
    written += Int64(data.count)
    let total = expectedTotal > 0 ? expectedTotal : max(written, 1)
    let progress = 0.05 + (Double(written) / Double(total)) * 0.5
    emit(progress, total, written)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error, thrown == nil {
      thrown = error
    }
    semaphore.signal()
  }
}
