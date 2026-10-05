"""Compare corresponding JCE events; timing adaptation remains explicitly visible.
This contact sheet complements, rather than replaces, the full speed comparison.
"""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
parser=argparse.ArgumentParser()
parser.add_argument('--capture',required=True)
parser.add_argument('--reference',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
# Reference clock is the uploaded recording clock (reported 2x playback).
# Midpoints of the five travel events, then field/return/sheath/final burst.
phases=[('travel 1',.8,.28),('travel 2',1.2,.56),('travel 3',1.6,.84),('travel 4',2,1.12),('travel 5',2.4,1.4),('field',3.1,1.88),('return',4.1,2.59),('sheath',4.6,3),('final burst',5.4,3.85)]
canvas=Image.new('RGB',(1280,9*290));draw=ImageDraw.Draw(canvas)
for i,(phase,ref,game) in enumerate(phases):
 for side,(path,t) in enumerate([(args.reference,ref),(args.capture,game)]):
  dest=out/f'{i}-{side}.png'
  subprocess.run(['ffmpeg','-y','-ss',str(t),'-i',path,'-frames:v','1','-loglevel','error',str(dest)],check=True)
  im=Image.open(dest).convert('RGB');im.thumbnail((640,260));canvas.paste(im,(side*640+(640-im.width)//2,i*290+30))
  label=f'{phase}: '+('REFERENCE uploaded clock' if side==0 else 'GAME compressed clock')+f' {t:.2f}s'
  draw.text((side*640+8,i*290+8),label,fill='white')
canvas.save(out/'phase-comparison.jpg')
(out/'phase-comparison.json').write_text(json.dumps({'completeTrace':False,'temporalMatch':False,'note':'Event alignment for pose inspection only. Game travel clock uses 0.35 compression; the original full video comparison is retained. Cameras/depth are not calibrated.','reference':args.reference,'capture':args.capture,'phases':[{'phase':p,'referenceRecordingSeconds':r,'gameSeconds':g} for p,r,g in phases]},indent=2))
print(out/'phase-comparison.jpg')
