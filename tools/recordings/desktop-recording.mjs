// FFmpeg records the isolated VM display. Playwright drives only its browser.
import {mkdir, readFile, writeFile, cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {vm, guestPath} from './vm-desktop.mjs';
import {createHash} from 'node:crypto';

const sessions = new WeakMap();
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {encoding:'utf8', windowsHide:true});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'FFmpeg failed');
}

export async function recordingContext(browser, options, artifact) {
  // Let the real guest window determine layout instead of emulating a viewport
  // that can clip controls while FFmpeg records the physical desktop.
  const context = await browser.newContext({...options, viewport:null});
  sessions.set(context, {artifact, clips:[]});
  return context;
}

export async function preparePage(page) {
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page);
  try {
    const {windowId} = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {windowId, bounds:{left:40, top:20, width:1360, height:855}});
  } finally {
    await cdp.detach();
  }
}

export async function record(page, name, story, {foreground} = {}) {
  const session = sessions.get(page.context());
  if (!session) throw new Error('Use a recording context');
  console.log('Recording ' + name);
  await preparePage(page);
  await foreground?.();
  const directory = resolve(session.artifact, name);
  await mkdir(directory, {recursive:true});
  const raw = resolve(directory, 'raw.mkv');
  const args = ['env','DISPLAY=:99','ffmpeg','-hide_banner','-loglevel','error','-y','-f','x11grab','-framerate','25','-video_size','1440x900','-i',':99.0','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-progress','pipe:1',guestPath(raw)];
  const child = spawn('wsl.exe', ['-d',vm,'--exec',...args], {windowsHide:true, stdio:['pipe','pipe','pipe']});
  let errors='', progress=''; child.stderr.on('data', chunk => errors += chunk);
  child.stdin.on('error', error => { errors += error.message; });
  const finished = new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(new Error(errors||'VM capture exited '+code)));});
  finished.catch(()=>{}); // Readiness reports early failures before awaiting shutdown.
  // Read FFmpeg's progress rather than creating a screenshot/capture loop.
  try{await new Promise((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('VM capture did not start: '+errors)),15000);child.stdout.on('data',chunk=>{progress+=chunk;if(/frame=\s*[1-9]/.test(progress)){clearTimeout(timeout);done();}});child.once('exit',()=>{clearTimeout(timeout);reject(new Error(errors));});});}catch(error){if(child.exitCode===null)child.stdin.write('q');await finished.catch(()=>{});throw error;}
  const started=Date.now(), seconds=()=> (Date.now()-started)/1000, segments=[];
  let start=0;
  const omitWait=async task=>{segments.push([start,seconds()]);try{return await task();}finally{start=seconds();}};
  let succeeded=false;
  try{await story({omitWait});segments.push([start,seconds()]);succeeded=true;}
  finally{child.stdin.write('q');await finished;}
  if(succeeded)session.clips.push({raw,name,segments});
}

// Export the VM desktop master after the browser fixture has been disposed.
export async function closeRecording(context, {artifact, output}) {
  await context.close();
  const session = sessions.get(context);
  const entries = [];
  for (const {raw, name, segments} of session.clips) {
    const directory = resolve(artifact, name);
    await mkdir(directory, {recursive:true});
    const movie = resolve(directory, 'demo.mp4');
    const filters = segments.map(([start, end], index) => '[0:v]trim=start=' + start.toFixed(3) + ':end=' + end.toFixed(3) + ',setpts=PTS-STARTPTS[s' + index + ']').join(';') + ';' +
      segments.map((_, index) => '[s' + index + ']').join('') + 'concat=n=' + segments.length + ':v=1:a=0,fps=25,scale=' + '1200' + ':-2:flags=lanczos[out]';
    ffmpeg(['-i', raw, '-filter_complex', filters, '-map', '[out]', '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', movie]);
    const gif = resolve(directory, 'demo.gif');
    ffmpeg(['-i', movie, '-filter_complex', 'fps=8,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '-1', gif]);
    const bytes = await readFile(gif), movieBytes = await readFile(movie);
    const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 16);
    const file = name + '.' + hash(bytes) + '.gif', movieFile = name + '.' + hash(movieBytes) + '.mp4';
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',movie],{encoding:'utf8',windowsHide:true});
    if(probe.status!==0||!Number.isFinite(Number(probe.stdout)))throw new Error('Cannot verify exported duration');
    const duration=Math.round(Number(probe.stdout)*1000);
    const posterPath = resolve(directory, 'poster.webp');
    ffmpeg(['-ss', String(name.startsWith('edgepress-') ? Math.max(0, duration / 1000 - 3) : 0), '-i', movie, '-frames:v', '1', '-quality', '90', posterPath]);
    const poster = name + '.' + hash(await readFile(posterPath)) + '.webp';
    for (const [source, target] of [[gif, file], [movie, movieFile], [posterPath, poster]]) await cp(source, resolve(output, target));
    const entry = {name, file, poster, movie:movieFile, movieBytes:movieBytes.length, duration, bytes:bytes.length,
      date:new Date().toISOString().slice(0, 10), kind:'FFmpeg recording of an isolated WSL2 desktop; '+(name.startsWith('edgepress-')||name.startsWith('ishare-sharing-')?'real terminal, editor and Chromium; preview startup wait shortened':'actual Chromium interface')+'; isolated service fixtures', source:'tools/recordings/capture-project-demos.mjs'};
    entries.push(entry);
    const manifest = resolve(artifact, 'manifest.json'), previous = await readFile(manifest, 'utf8').then(JSON.parse).catch(() => []);
    await writeFile(manifest, JSON.stringify([...previous.filter(item => item.name !== name), entry], null, 2) + '\n');
    console.log(JSON.stringify(entry));
  }
  sessions.delete(context);
  return entries;
}
