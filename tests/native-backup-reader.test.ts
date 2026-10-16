import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('native backup stream caps actual bytes, handles pipes/Unicode/short reads and always closes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dailoop-backup-reader-'));
  const home = process.env.JAVA_HOME ?? 'C:/Program Files/Eclipse Adoptium/jdk-17.0.14.7-hotspot';
  const executable = (name: string) => process.platform === 'win32' ? join(home, 'bin', name + '.exe') : name;
  const helper = join(process.cwd(), 'modules/dailoop-glass/android/src/main/java/local/dailoop/glass/BoundedBackupReader.java');
  const native = readFileSync(join(process.cwd(), 'modules/dailoop-glass/android/src/main/java/local/dailoop/glass/DailoopBackupModule.kt'), 'utf8');
  assert.match(native, /Dispatchers\.IO/);
  assert.match(native, /readUtf8\(stream, 50 \* 1024 \* 1024\)/);
  const harness = `import java.io.*;
import java.nio.charset.StandardCharsets;
import local.dailoop.glass.BoundedBackupReader;
public class BackupReaderCheck {
  static class Pipe extends InputStream {
    byte[] bytes; int cursor; int chunk; boolean closed; boolean firstZero; int failAt=-1;
    Pipe(byte[] bytes, int chunk) { this.bytes=bytes; this.chunk=chunk; }
    public int available() { throw new AssertionError("Provider metadata must not be read"); }
    public int read() throws IOException {
      if (failAt>=0 && cursor>=failAt) throw new IOException("Provider failed");
      return cursor==bytes.length ? -1 : bytes[cursor++] & 255;
    }
    public int read(byte[] dest,int offset,int length) throws IOException {
      if (firstZero) { firstZero=false; return 0; }
      if (failAt>=0 && cursor>=failAt) throw new IOException("Provider failed");
      if (cursor==bytes.length) return -1;
      int count=Math.min(Math.min(chunk,length),bytes.length-cursor);
      System.arraycopy(bytes,cursor,dest,offset,count);cursor+=count;return count;
    }
    public void close() { closed=true; }
  }
  static void expect(boolean value,String label) { if (!value) throw new AssertionError(label); }
  public static void main(String[] args) throws Exception {
    String text="{\\"note\\":\\"café 📚 y ñ\\"}";
    byte[] bytes=text.getBytes(StandardCharsets.UTF_8);
    for (int chunk : new int[]{1,2,3,8192}) {
      Pipe pipe=new Pipe(bytes,chunk);
      expect(BoundedBackupReader.readUtf8(pipe,bytes.length).equals(text),"Exact limit UTF8 "+chunk);
      expect(pipe.closed,"Successful stream closed");
    }
    Pipe over=new Pipe(new byte[100000],8192);
    try { BoundedBackupReader.readUtf8(over,10); throw new AssertionError("Oversize accepted"); }
    catch(IOException expected) { expect(expected.getMessage().contains("50 MiB"),"Size error"); }
    expect(over.cursor==11,"Never read more than limit plus one");expect(over.closed,"Oversize closed");
    Pipe shortRead=new Pipe(bytes,2);shortRead.firstZero=true;
    expect(BoundedBackupReader.readUtf8(shortRead,bytes.length).equals(text),"Zero/short read progresses");
    Pipe empty=new Pipe(new byte[0],1);expect(BoundedBackupReader.readUtf8(empty,0).isEmpty(),"Empty input");
    expect(empty.closed,"Empty closed");
    Pipe invalid=new Pipe(new byte[]{(byte)0xc3},1);
    try { BoundedBackupReader.readUtf8(invalid,1);throw new AssertionError("Invalid UTF8 silently replaced"); }
    catch(IOException expected) {} expect(invalid.closed,"Decode failure closed");
    Pipe broken=new Pipe(bytes,1);broken.failAt=3;
    try { BoundedBackupReader.readUtf8(broken,100);throw new AssertionError("Read failure swallowed"); }
    catch(IOException expected) {} expect(broken.closed,"Partial read failure closed");
    Pipe cancelled=new Pipe(bytes,1) { public int read(byte[] b,int o,int l) throws IOException {throw new InterruptedIOException("Cancelled");} };
    try {BoundedBackupReader.readUtf8(cancelled,100);throw new AssertionError("Cancellation swallowed");}
    catch(InterruptedIOException expected) {} expect(cancelled.closed,"Cancellation closed");
    System.out.println("bounded provider reading passed");
  }
}`;
  try {
    const java = join(directory, 'BackupReaderCheck.java');
    writeFileSync(java, harness, 'utf8');
    const compile = spawnSync(executable('javac'), ['-encoding', 'UTF-8', '-d', directory, helper, java], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || String(compile.error));
    const run = spawnSync(executable('java'), ['-cp', directory, 'BackupReaderCheck'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || String(run.error));
    assert.match(run.stdout, /bounded provider reading passed/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
