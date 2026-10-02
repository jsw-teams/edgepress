import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parsePublicationDate,publicationTimestamp,validateTimeZone} from '../src/publication-time.js';
import {readDocuments} from '../src/content.js';

test('publication timezone defaults to Taipei and calendar dates remain dates',()=>{
  assert.equal(parsePublicationDate('2026-10-03').toISOString(),'2026-10-03T00:00:00.000Z');
  assert.equal(parsePublicationDate('2026-10-03T09:15').toISOString(),'2026-10-03T01:15:00.000Z');
  assert.equal(parsePublicationDate('2026-10-03 09:15:30.123').toISOString(),'2026-10-03T01:15:30.123Z');
  assert.equal(parsePublicationDate('2026-10-03T09:15:00+02:00').toISOString(),'2026-10-03T07:15:00.000Z');
  assert.equal(publicationTimestamp(new Date('2026-10-02T20:00:00Z')),'2026-10-03T04:00:00+08:00');
  assert.equal(parsePublicationDate('2026-10-03T09:15','America/Los_Angeles').toISOString(),'2026-10-03T16:15:00.000Z');
  for(const value of ['2026-02-30','2026-10-03T24:00','2026-10-03T08:70'])assert.throws(()=>parsePublicationDate(value));
  assert.throws(()=>validateTimeZone('not/a-zone'),/time zone/);
  assert.throws(()=>parsePublicationDate('2026-03-08T02:30','America/New_York'),/nonexistent/);
  assert.throws(()=>parsePublicationDate('2026-11-01T01:30','America/New_York'),/Ambiguous/);
});

test('build host timezone cannot affect publication parsing or writing timestamps',()=>{
  const module=new URL('../src/publication-time.js',import.meta.url).href;
  const script=`import {parsePublicationDate,publicationTimestamp} from ${JSON.stringify(module)}; console.log(parsePublicationDate('2026-10-03T09:15').toISOString(), publicationTimestamp(new Date('2026-10-02T20:00:00Z')));`;
  const outputs=['UTC','America/Los_Angeles','Asia/Tokyo'].map(TZ=>{
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TZ}});
    assert.equal(result.status,0,result.stderr);return result.stdout;
  });
  assert.equal(new Set(outputs).size,1);
});

test('month boundary permalink follows written publication date, not UTC conversion',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'edgepress-date-'));
  try{
    await mkdir(join(folder,'posts/article'),{recursive:true});
    await writeFile(join(folder,'posts/article/en.md'),'---\ntitle: Article\ndate: 2026-10-01T01:00\nlang: en\n---\nText');
    const config={site:{timeZone:'Asia/Taipei'},resolvedPaths:{content:folder},i18n:{defaultLocale:'en',locales:['en']},concurrency:1,permalink:'/:year/:month/:day/:slug/'};
    const [post]=await readDocuments(config);assert.equal(post.date.toISOString(),'2026-09-30T17:00:00.000Z');assert.equal(post.path,'2026/10/01/article/');assert.equal(post.dateOnly,false);
    await writeFile(join(folder,'posts/article/en.md'),'---\ntitle: Article\ndate: 2026-10-01\nlang: en\n---\nText');
    const [dateOnly]=await readDocuments(config);assert.equal(dateOnly.dateOnly,true);assert.equal(dateOnly.path,post.path);
  }finally{await rm(folder,{recursive:true,force:true});}
});
