import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const vm = process.env.RECORDING_VM || 'CodexRecordingVM';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../..').replaceAll('\\','/');
export const guestPath = path => resolve(path).replaceAll('\\', '/').replace(workspace,process.env.RECORDING_GUEST_ROOT||'/opt/recording/workspace').replace(/^([a-z]):/i, (_, drive) => '/mnt/' + drive.toLowerCase());
function guestProcess(args) {
  const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
  const child = spawn('wsl.exe', ['-d', vm, '--exec', 'bash', '-s'], {windowsHide:true});
  child.stdin.end('exec env -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS -u XDG_RUNTIME_DIR LANG=C.UTF-8 DISPLAY=:99 GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb NO_AT_BRIDGE=1 ' + args.map(quote).join(' ') + '\n');
  return child;
}
export async function openApp(args, title) {
  const child = guestProcess(args);
  let errors=''; child.stderr.on('data', chunk => errors += chunk); child.stdout.resume();
  child.on('error', error => { errors += error.message; });
  for (let attempt=0;attempt<40;attempt++) {
    try { await activate(title); return child; } catch {}
    if(child.exitCode!==null)throw new Error(args[0] + ' failed: ' + errors);
    await new Promise(done=>setTimeout(done,200));
  }
  child.kill();throw new Error(args[0] + ' did not open: ' + errors);
}
export async function guest(args) {
  return new Promise((done, reject) => {
    // UTF-8 stdin avoids Windows/WSL command-line reparsing of paths and quotes.
    const child = guestProcess(['timeout', '15s', ...args]);
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.once('error', reject); child.once('exit', code => code === 0 ? done(output.trim()) : reject(new Error(args[0] + ' exited ' + code + ': ' + output)));
  });
}
export async function activate(title) {
  const id = (await guest(['xdotool', 'search', '--onlyvisible', '--name', title])).split(/\s+/).at(-1);
  await guest(['xdotool', 'windowactivate', '--sync', id]);
}

// Move only the guest's real X11 pointer so FFmpeg records the same cursor the
// browser receives. CDP coordinates alone leave the desktop cursor behind.
export async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await new Promise(done => setTimeout(done, 250));
  const box = await locator.boundingBox();
  if (!box) throw new Error('Demo target is not visible');
  const position = {x:box.x + box.width / 2, y:box.y + box.height / 2};
  await pointAtPosition(page, position);
  return position;
}

async function windowOrigin(page) {
  return page.evaluate(() => ({
    x:screenX + (outerWidth - innerWidth) / 2,
    y:screenY + outerHeight - innerHeight
  }));
}

export async function pointAtPosition(page, {x, y}) {
  const window = await windowOrigin(page);
  // --sync waits for a movement event forever when the pointer is already here.
  await guest(['xdotool', 'mousemove', String(Math.round(window.x + x)), String(Math.round(window.y + y))]);
  await page.mouse.move(x, y);
}

export async function drag(page, {from, to, steps=16, duration=900}) {
  const window = await windowOrigin(page);
  const coordinates = point => [String(Math.round(window.x + point.x)), String(Math.round(window.y + point.y))];
  // Keep press, movement and release in one native event stream. Mixing CDP
  // button state with X11 movement can cancel the actual browser drag.
  const args = ['xdotool', 'mousemove', ...coordinates(from), 'mousedown', '1'];
  for (let step=1; step<=steps; step++) {
    args.push('sleep', String(duration / steps / 1000), 'mousemove', ...coordinates({
      x:from.x + (to.x - from.x) * step / steps,
      y:from.y + (to.y - from.y) * step / steps
    }));
  }
  args.push('mouseup', '1');
  await guest(args);
  await page.mouse.move(to.x, to.y);
}

export async function chooseFiles(page, input) {
  // The private guest Desktop contains only the two demo attachments. Native
  // GTK coordinates are scoped to this controlled VM, never the host desktop.
  await pointAt(page, input);
  await guest(['xdotool', 'click', '1']);
  await new Promise(done => setTimeout(done, 1000));
  await activate('Open File');
  const id = (await guest(['xdotool', 'search', '--onlyvisible', '--name', 'Open File'])).split(/\s+/).at(-1);
  const geometry = Object.fromEntries((await guest(['xdotool', 'getwindowgeometry', '--shell', id])).split('\n').map(line => line.split('=')).map(([key, value]) => [key, Number(value)]));
  const move = async (x, y) => guest(['xdotool', 'mousemove', String(Math.round(x)), String(Math.round(y)), 'click', '1']);
  await move(geometry.X + 65, geometry.Y + 75); // Desktop bookmark.
  await new Promise(done => setTimeout(done, 1200));
  await move(geometry.X + 340, geometry.Y + 63); // First file row.
  await guest(['xdotool', 'key', 'ctrl+a']);
  await new Promise(done => setTimeout(done, 900));
  // Click Open explicitly; Enter can activate GTK's Cancel default.
  await move(geometry.X + geometry.WIDTH - 53, geometry.Y + geometry.HEIGHT - 43);
}
export async function typeCommand(root, title, command) {
  const path = resolve(root, '.recording-command.txt');
  await writeFile(path, command);
  await activate(title);
  await guest(['xdotool', 'type', '--clearmodifiers', '--delay', '70', '--file', guestPath(path)]);
  await guest(['xdotool', 'key', 'Return']);
}
export async function editFile(root, file, source) {
  const path = resolve(root, '.recording-editor.txt');
  await writeFile(path, source);
  await openApp(['geany', '-i', guestPath(file)], 'Geany');
  const id=(await guest(['xdotool','search','--onlyvisible','--name','Geany'])).split(/\s+/).at(-1);
  await guest(['xdotool','windowsize','--sync',id,'1200','780','windowmove',id,'100','70']);
  // Keep the guest X11 selection owner alive until GTK has read the clipboard.
  const clipboard=guestProcess(['xclip','-quiet','-selection','clipboard','-in',guestPath(path)]);
  clipboard.stdout.resume();clipboard.stderr.resume();
  try{
    await new Promise(done=>setTimeout(done,300));
    await guest(['xdotool', 'key', 'ctrl+a', 'ctrl+v']);
    await new Promise(done => setTimeout(done, 1800));
    await guest(['xdotool', 'key', 'ctrl+s']);
    await new Promise(done=>setTimeout(done,300));
    if((await readFile(file,'utf8')).replaceAll('\r\n','\n')!==source.replaceAll('\r\n','\n'))throw new Error('Guest editor did not save the expected document');
  }finally{clipboard.kill();}
}
