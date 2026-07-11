import Foundation
import CommonCrypto

/// MEGA file decryption (AES-CTR style used by megajs).
/// Port of megajs CTR + AES2.encryptECB — uses standard AES/ECB for counter blocks.
final class MegaCtrDecryptor {
  private let aesKey: Data
  private var ctr = [UInt8](repeating: 0, count: 16)

  init(key: Data) throws {
    guard key.count >= 24 else {
      throw NSError(domain: "MegaCtrDecryptor", code: 1, userInfo: [NSLocalizedDescriptionKey: "MEGA key must be at least 24 bytes"])
    }
    let unmerged = MegaCtrDecryptor.unmergeKeyMac(key)
    aesKey = unmerged.prefix(16)
    let nonce = key.subdata(in: 16..<24)
    nonce.copyBytes(to: &ctr, count: 8)
  }

  func decryptFile(input: URL, output: URL, bufferSize: Int = 1024 * 1024) throws {
    let inputHandle = try FileHandle(forReadingFrom: input)
    defer { try? inputHandle.close() }

    FileManager.default.createFile(atPath: output.path, contents: nil)
    let outputHandle = try FileHandle(forWritingTo: output)
    defer { try? outputHandle.close() }

    while true {
      let chunk = inputHandle.readData(ofLength: bufferSize)
      if chunk.isEmpty { break }
      var mutable = chunk
      decryptInPlace(&mutable)
      outputHandle.write(mutable)
    }
  }

  private func decryptInPlace(_ buffer: inout Data) {
    var offset = 0
    while offset < buffer.count {
      var counter = ctr
      let keystream = aesEcbEncryptBlock(counter: &counter)
      let blockEnd = min(offset + 16, buffer.count)
      for i in offset..<blockEnd {
        buffer[i] ^= keystream[i - offset]
      }
      offset += 16
      incrementCtr(1)
    }
  }

  private func aesEcbEncryptBlock(counter: inout [UInt8]) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: 16)
    aesKey.withUnsafeBytes { keyBytes in
      counter.withUnsafeMutableBytes { ctrBytes in
        out.withUnsafeMutableBytes { outBytes in
          _ = CCCrypt(
            CCOperation(kCCEncrypt),
            CCAlgorithm(kCCAlgorithmAES),
            CCOptions(kCCOptionECBMode),
            keyBytes.baseAddress,
            aesKey.count,
            nil,
            ctrBytes.baseAddress,
            16,
            outBytes.baseAddress,
            16,
            nil
          )
        }
      }
    }
    return out
  }

  private func incrementCtr(_ count: Int) {
    var remaining = count
    var i = 15
    while remaining != 0 {
      let mod = (remaining + Int(ctr[i])) % 256
      remaining = (remaining + Int(ctr[i])) / 256
      ctr[i] = UInt8(mod)
      i -= 1
      if i < 0 { i = 15 }
    }
  }

  private static func unmergeKeyMac(_ key: Data) -> Data {
    var out = Data(count: 32)
    let copyLen = min(key.count, 32)
    out.replaceSubrange(0..<copyLen, with: key.prefix(copyLen))
    for i in 0..<16 {
      out[i] = out[i] ^ out[i + 16]
    }
    return out
  }
}
