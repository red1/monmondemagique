package com.monmondemagique.app.storypack

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

/**
 * MEGA file decryption (AES-CTR style used by megajs).
 * Port of megajs CTR + AES2.encryptECB — uses standard AES/ECB for counter blocks.
 */
class MegaCtrDecryptor(key: ByteArray) {
  private val aesKey: ByteArray
  private val cipher: Cipher
  private val ctr = ByteArray(16)

  init {
    require(key.size >= 24) { "MEGA key must be at least 24 bytes" }
    val unmerged = unmergeKeyMac(key)
    aesKey = unmerged.copyOfRange(0, 16)
    val nonce = key.copyOfRange(16, 24)
    System.arraycopy(nonce, 0, ctr, 0, 8)
    cipher = Cipher.getInstance("AES/ECB/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(aesKey, "AES"))
  }

  fun decryptFile(input: File, output: File, bufferSize: Int = 1024 * 1024) {
    FileInputStream(input).use { inp ->
      FileOutputStream(output).use { out ->
        val buf = ByteArray(bufferSize)
        var read: Int
        while (inp.read(buf).also { read = it } != -1) {
          if (read == 0) continue
          val chunk = if (read == buf.size) buf else buf.copyOf(read)
          decryptInPlace(chunk)
          out.write(chunk)
        }
      }
    }
  }

  private fun decryptInPlace(buffer: ByteArray) {
    var offset = 0
    while (offset < buffer.size) {
      val keystream = cipher.doFinal(ctr.copyOf())
      val blockEnd = minOf(offset + 16, buffer.size)
      for (i in offset until blockEnd) {
        buffer[i] = (buffer[i].toInt() xor keystream[i - offset].toInt()).toByte()
      }
      offset += 16
      incrementCtr(1)
    }
  }

  private fun incrementCtr(count: Int) {
    var remaining = count
    var i = 15
    while (remaining != 0) {
      val mod = (remaining + (ctr[i].toInt() and 0xff)) % 256
      remaining = (remaining + (ctr[i].toInt() and 0xff)) / 256
      ctr[i] = mod.toByte()
      i -= 1
      if (i < 0) i = 15
    }
  }

  companion object {
    private fun unmergeKeyMac(key: ByteArray): ByteArray {
      val out = key.copyOf(32)
      for (i in 0 until 16) {
        out[i] = (out[i].toInt() xor out[i + 16].toInt()).toByte()
      }
      return out
    }
  }
}
