"""Assemble real captures and reference pairs; never infer trace completion from a video.
Original footage stays outside public/ and Git. It is found by attachment basename.
"""
import argparse,json,math,subprocess
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--captures',type=Path,required=True)
parser.add_argument('--attachments',type=Path,default=Path('/workspace/attachments'))
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
catalog=json.loads(Path('docs/reference-analysis/technique-trace-catalog.json').read_text())
attachments={Path(f).name:Path(f) for f in subprocess.check_output(['rg','--files',str(args.attachments)],text=True).splitlines()}
def ffmpeg(arguments):subprocess.run(['ffmpeg','-y',*map(str,arguments),'-loglevel','error'],check=True)
manifest=[]
for f in sorted(args.captures.glob('*-timeline.json')):
 id=f.name.removesuffix('-timeline.json');rows=json.loads(f.read_text());lengths=[math.dist(r['bones']['RightArm'],r['bones']['RightForeArm'])+math.dist(r['bones']['RightForeArm'],r['bones']['RightHand']) for r in rows]
 finite=all(math.isfinite(v) for r in rows for b in r['rig'].values() for values in b.values() for v in values)
 if not finite:raise ValueError(id+' contains invalid skeleton values')
 manifest.append({'id':id,'frames':len(rows),'seconds':rows[-1]['t'],'finite':finite,'boneCount':len(rows[0]['rig']),'armLengthVariationMetres':max(lengths)-min(lengths),'movie':str(args.captures/(id+'.mp4'))})
comparisons=[]
for technique in catalog['techniques']:
 ref=technique['reference'];capture=next((id for id in technique['captures'] if (args.captures/(id+'.mp4')).exists()),None)
 if not ref or not capture:continue
 source=attachments.get(ref['file'])
 if not source:continue
 start,end=ref['recordedSeconds'];dest=args.output/('compare-'+technique['id']+'.mp4');speed=ref['reportedPlaybackSpeed']
 # Fit each full frame inside its panel. End-frame padding is labelled editorially.
 label=capture.replace("'",'')
 filters=f"[0:v]scale=640:426:force_original_aspect_ratio=decrease,pad=640:426:(ow-iw)/2:(oh-ih)/2,setpts={speed}*(PTS-STARTPTS),fps=30,drawtext=text='REFERENCE - reported 2x playback normalized':x=8:y=12:fontsize=15:fontcolor=white:box=1:boxcolor=black@0.8[l];[1:v]scale=640:426:force_original_aspect_ratio=decrease,pad=640:426:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=16,drawtext=text='{label} - game pace (end frame padded)':x=8:y=12:fontsize=15:fontcolor=white:box=1:boxcolor=black@0.8[r];[l][r]hstack=shortest=1[v]"
 ffmpeg(['-ss',start,'-t',end-start,'-i',source,'-i',args.captures/(capture+'.mp4'),'-filter_complex',filters,'-map','[v]','-an','-c:v','libx264','-pix_fmt','yuv420p',dest])
 duration=(end-start)*speed
 ffmpeg(['-i',dest,'-vf',f'fps={9/duration:.8f},scale=640:213,tile=3x3','-frames:v',1,args.output/('compare-'+technique['id']+'.jpg')])
 comparisons.append({'technique':technique['id'],'capture':capture,'reference':ref,'movie':str(dest),'completeTrace':False})
 print('Compared',technique['id'],flush=True)
playlist=args.output/'playlist.txt';playlist.write_text('\n'.join("file '"+r['movie'].replace("'","'\\''")+"'" for r in manifest))
if manifest:ffmpeg(['-f','concat','-safe',0,'-i',playlist,'-c','copy',args.output/'all-techniques.mp4'])
(args.output/'review-manifest.json').write_text(json.dumps({'catalog':catalog,'captures':manifest,'comparisons':comparisons,'limitations':['Comparison cameras are not calibrated.','Only recorded frames are observed; unseen joint depth remains inferred.','Game speed differs from reference time.','End-frame padding is editing, not game hold time.','No technique is automatically certified as a complete trace.']},ensure_ascii=False,indent=2))
print(json.dumps({'captures':len(manifest),'comparedFamilies':len(comparisons),'finite':all(r['finite'] for r in manifest)}))
