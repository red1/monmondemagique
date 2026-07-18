import Foundation
import MediaPlayer
import React
import UIKit

@objc(StoryMediaSession)
class StoryMediaSession: RCTEventEmitter {
  private var hasListeners = false
  private var commandsEnabled = false

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    ["storyMediaCommand"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc
  func activate(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.applyOptions(options)
      self.enableRemoteCommands()
      UIApplication.shared.beginReceivingRemoteControlEvents()
      resolve(true)
    }
  }

  @objc
  func update(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.applyOptions(options)
      if !self.commandsEnabled {
        self.enableRemoteCommands()
        UIApplication.shared.beginReceivingRemoteControlEvents()
      }
      resolve(true)
    }
  }

  @objc
  func deactivate(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.disableRemoteCommands()
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      UIApplication.shared.endReceivingRemoteControlEvents()
      resolve(true)
    }
  }

  private func applyOptions(_ options: NSDictionary) {
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]

    if let title = options["title"] as? String {
      info[MPMediaItemPropertyTitle] = title
    }
    if let artist = options["artist"] as? String {
      info[MPMediaItemPropertyArtist] = artist
    } else if options["artist"] is NSNull {
      info.removeValue(forKey: MPMediaItemPropertyArtist)
    }
    if let durationMs = options["durationMs"] as? Double {
      info[MPMediaItemPropertyPlaybackDuration] = durationMs / 1000.0
    }
    if let positionMs = options["positionMs"] as? Double {
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionMs / 1000.0
    }
    if let isPlaying = options["isPlaying"] as? Bool {
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
    }

    let canNext = (options["canSkipNext"] as? Bool) ?? true
    let canPrev = (options["canSkipPrevious"] as? Bool) ?? true
    MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled = canNext
    MPRemoteCommandCenter.shared().previousTrackCommand.isEnabled = canPrev

    if let artworkUrl = options["artworkUrl"] as? String {
      self.loadArtwork(urlString: artworkUrl) { image in
        if let image = image {
          info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    } else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
  }

  private func enableRemoteCommands() {
    if commandsEnabled { return }
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.togglePlayPauseCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
    center.changePlaybackPositionCommand.isEnabled = true

    center.playCommand.addTarget { [weak self] _ in
      self?.emitCommand("play")
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.emitCommand("pause")
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.emitCommand("toggle")
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.emitCommand("next")
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.emitCommand("previous")
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      self?.emitSeek(positionMs: event.positionTime * 1000.0)
      return .success
    }

    commandsEnabled = true
  }

  private func disableRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.removeTarget(nil)
    center.pauseCommand.removeTarget(nil)
    center.togglePlayPauseCommand.removeTarget(nil)
    center.nextTrackCommand.removeTarget(nil)
    center.previousTrackCommand.removeTarget(nil)
    center.changePlaybackPositionCommand.removeTarget(nil)
    commandsEnabled = false
  }

  private func emitCommand(_ command: String) {
    guard hasListeners else { return }
    sendEvent(withName: "storyMediaCommand", body: ["command": command])
  }

  private func emitSeek(positionMs: Double) {
    guard hasListeners else { return }
    sendEvent(withName: "storyMediaCommand", body: [
      "command": "seek",
      "positionMs": positionMs,
    ])
  }

  private func loadArtwork(urlString: String, completion: @escaping (UIImage?) -> Void) {
    DispatchQueue.global(qos: .utility).async {
      var image: UIImage?
      if urlString.hasPrefix("file://"), let url = URL(string: urlString), let data = try? Data(contentsOf: url) {
        image = UIImage(data: data)
      } else if let url = URL(string: urlString), (urlString.hasPrefix("http://") || urlString.hasPrefix("https://")),
                let data = try? Data(contentsOf: url) {
        image = UIImage(data: data)
      } else if FileManager.default.fileExists(atPath: urlString) {
        image = UIImage(contentsOfFile: urlString)
      }
      DispatchQueue.main.async {
        completion(image)
      }
    }
  }
}
