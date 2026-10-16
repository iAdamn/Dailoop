package local.dailoop.glass;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Counts provider bytes before decoding; never seeks, copies to disk or trusts size metadata. */
public final class BoundedBackupReader {
  private BoundedBackupReader() {}

  public static String readUtf8(InputStream source, int maxBytes) throws IOException {
    if (maxBytes < 0) throw new IllegalArgumentException("Invalid byte limit");
    try (InputStreamReader reader = new InputStreamReader(new LimitedInput(source, maxBytes),
        StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT))) {
      StringBuilder text = new StringBuilder(Math.min(maxBytes, 8192));
      char[] chunk = new char[4096];
      int count;
      while ((count = reader.read(chunk)) != -1) text.append(chunk, 0, count);
      return text.toString();
    }
  }

  private static final class LimitedInput extends FilterInputStream {
    private final int limit;
    private long consumed;
    LimitedInput(InputStream source, int limit) { super(source); this.limit = limit; }
    // Reader uses available() only as a nonblocking hint. Provider metadata is
    // unnecessary, and some providers cannot report it at all.
    @Override public int available() { return 0; }
    private void count(int length) throws IOException {
      if (length > 0 && (consumed += length) > limit) {
        throw new IOException("La copia supera el límite de 50 MiB.");
      }
    }
    @Override public int read() throws IOException {
      int value = in.read();
      if (value != -1) count(1);
      return value;
    }
    @Override public int read(byte[] buffer, int offset, int length) throws IOException {
      if (length == 0) return 0;
      int allowed = (int) Math.min(length, limit - consumed + 1);
      int result = in.read(buffer, offset, allowed);
      // A legal InputStream should not return zero for a nonempty request, but
      // providers sometimes do. Make progress without spinning indefinitely.
      if (result == 0) {
        int value = read();
        if (value == -1) return -1;
        buffer[offset] = (byte) value;
        return 1;
      }
      count(result);
      return result;
    }
  }
}
