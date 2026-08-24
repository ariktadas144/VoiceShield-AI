from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

SP="/tmp/claude-1000/-home-aayushdwivedi-Projects/f1f77f78-ec64-435b-82e8-2dfd7bed9bc3/scratchpad"
INK=RGBColor(0x1E,0x1E,0x1E); MUT=RGBColor(0x5C,0x56,0x50); WHITE=RGBColor(0xFF,0xFF,0xFF)
BLUE=RGBColor(0x19,0x71,0xC2); BLUEF=RGBColor(0xE7,0xF2,0xFC)
RED=RGBColor(0xE0,0x31,0x31);  REDF=RGBColor(0xFF,0xF0,0xEF)
GRN=RGBColor(0x2F,0x9E,0x44);  GRNF=RGBColor(0xEE,0xFB,0xF1)
AMB=RGBColor(0xF0,0x8C,0x00);  AMBF=RGBColor(0xFF,0xF8,0xE6)
VIO=RGBColor(0x9C,0x36,0xB5)
PANEL=RGBColor(0xF5,0xF2,0xEC)
F="Arial"

prs=Presentation(); prs.slide_width=Emu(12192000); prs.slide_height=Emu(6858000)
blank=prs.slide_layouts[6]

def tbox(s,x,y,w,h,anchor=MSO_ANCHOR.TOP):
    b=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h))
    tf=b.text_frame; tf.word_wrap=True; tf.margin_left=0; tf.margin_right=0
    tf.margin_top=0; tf.margin_bottom=0; tf.vertical_anchor=anchor
    return tf

def para(tf,first=False):
    return tf.paragraphs[0] if first else tf.add_paragraph()

def run(p,txt,size=11,bold=False,color=INK,italic=False,font=F):
    r=p.add_run(); r.text=txt
    r.font.size=Pt(size); r.font.bold=bold; r.font.italic=italic
    r.font.color.rgb=color; r.font.name=font
    return r

def card(s,x,y,w,h,line,fill,width_pt=2.0):
    sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb=fill
    sh.line.color.rgb=line; sh.line.width=Pt(width_pt)
    sh.shadow.inherit=False
    sh.adjustments[0]=0.06
    sh.text_frame.text=""
    return sh

# ══════════════════════════ SLIDE 1 ══════════════════════════
s1=prs.slides.add_slide(blank)
tf=tbox(s1,0.42,0.20,12.5,0.44)
p=para(tf,True); run(p,"Streaming Middleware Bridge (gRPC)",26,True,INK)
run(p,"   —   Component 2 of 4",26,False,BLUE)

tf=tbox(s1,0.42,0.66,12.5,0.30)
p=para(tf,True)
run(p,"The only stateful, real-time component: turns live forked call audio into scored analysis windows inside a 500 ms budget, for ~1,200 concurrent calls — on a stream that cannot be paused.",11.5,False,MUT)

s1.shapes.add_picture(f"{SP}/dia/A_context.png",Inches(1.57),Inches(1.00),width=Inches(10.2))
s1.shapes.add_picture(f"{SP}/dia/B_pipeline.png",Inches(1.57),Inches(3.20),width=Inches(10.2))

specs=[("2.0 s / 100 ms","window & hop → 10 scores/sec",BLUE,BLUEF),
       ("500 ms","end-to-end SLA budget",VIO,RGBColor(0xF8,0xEF,0xFB)),
       ("1,200","concurrent calls per node",GRN,GRNF),
       ("71","edge cases specified & tested",RED,REDF)]
x=0.86
for title,sub,ln,fl in specs:
    card(s1,x,6.44,2.78,0.74,ln,fl,1.75)
    tf=tbox(s1,x+0.14,6.52,2.5,0.58)
    p=para(tf,True); run(p,title,15,True,ln)
    p=tf.add_paragraph(); run(p,sub,9,False,MUT)
    x+=2.94

tf=tbox(s1,0.86,7.22,11.6,0.24)
p=para(tf,True)
run(p,"CORE CONSTRAINT:  ",9.5,True,RED)
run(p,"every other service in the system can tell its upstream to slow down. A phone call cannot. Every design decision follows from that.",9.5,False,MUT)

# ══════════════════════════ SLIDE 2 ══════════════════════════
s2=prs.slides.add_slide(blank)
tf=tbox(s2,0.42,0.20,12.5,0.44)
p=para(tf,True); run(p,"Latency, Failure Handling & the Edge Cases That Fail Silently",26,True,INK)

tf=tbox(s2,0.42,0.66,12.5,0.28)
p=para(tf,True)
run(p,"Most failures are loud, and therefore cheap. The expensive ones produce plausible-looking numbers that are wrong.",11.5,False,MUT)

s2.shapes.add_picture(f"{SP}/dia/C_latency.png",Inches(0.38),Inches(0.98),width=Inches(6.30))
s2.shapes.add_picture(f"{SP}/dia/D_ladder.png",Inches(6.64),Inches(0.98),width=Inches(6.30))

hdr=tbox(s2,0.42,3.18,12.5,0.26)
p=para(hdr,True)
run(p,"THE THREE SILENT FAILURES",10,True,RED)
run(p,"   — no exception, no error, just quietly wrong output",10,False,MUT)

cards=[("AU-04","Averaging a dual-leg fork",
        "The gateway forks caller and callee as two channels. Averaging them mixes two speakers into one signal, destroying both the deepfake and the speaker-verification signal.",
        "FIX: mono mandatory. Two legs = two sessions. Reject 2-channel input outright.",
        "TEST: assert channels==1 at the ingress adapter; a 2-channel fixture must raise, not average."),
       ("AU-08","Packet-loss concealment",
        "On a bad line the gateway invents audio to cover lost packets. That audio is literally synthetic — so the detector flags a genuine caller as a deepfake.",
        "FIX: gateway sets concealed=true; windows >15% concealed are skipped or down-weighted.",
        "TEST: replay at 30% packet loss with PLC on — false-positive rate must not rise."),
       ("SS-06","Missing speaker enrolment",
        "No reference voiceprint returns similarity 0.0, which fusion reads as 'total mismatch' — fabricating fraud signal for every non-enrolled caller.",
        "FIX: emit null + UNAVAILABLE. Risk engine renormalises over remaining signals.",
        "TEST: unenrolled caller must not raise the risk score above an enrolled-match baseline.")]
x=0.42
for cid,title,body,fix,test in cards:
    card(s2,x,3.46,3.98,2.18,RED,REDF,2.0)
    tf=tbox(s2,x+0.16,3.57,3.66,2.04)
    p=para(tf,True); run(p,cid,9,True,RED); run(p,"   ·   AUDIO" if cid.startswith("AU") else "   ·   SESSION",8,False,MUT)
    p=tf.add_paragraph(); p.space_before=Pt(2); run(p,title,12,True,INK)
    p=tf.add_paragraph(); p.space_before=Pt(3); run(p,body,9,False,INK)
    p=tf.add_paragraph(); p.space_before=Pt(4); run(p,fix,8.5,True,RED)
    p=tf.add_paragraph(); p.space_before=Pt(3); run(p,test,8,False,MUT,italic=True)
    x+=4.24

card(s2,0.42,5.80,7.72,1.42,BLUE,BLUEF,1.75)
tf=tbox(s2,0.58,5.92,7.44,1.24)
p=para(tf,True); run(p,"71 EDGE CASES ACROSS 8 CATEGORIES",9.5,True,BLUE)
p=tf.add_paragraph(); p.space_before=Pt(3)
run(p,"CX transport 20",8.5,True,INK); run(p,"  half-open sockets, HTTP/2 stream limits, GOAWAY, LB idle timeouts   ",8.5,False,MUT)
run(p,"AU audio 16",8.5,True,INK); run(p,"  endianness, clock drift, DTMF, mid-call codec change",8.5,False,MUT)
p=tf.add_paragraph()
run(p,"BF buffering 6",8.5,True,INK); run(p,"  ring overflow, hop alignment   ",8.5,False,MUT)
run(p,"SS session 6",8.5,True,INK); run(p,"  fencing, resume, Redis loss   ",8.5,False,MUT)
run(p,"IN inference 6",8.5,True,INK); run(p,"  out-of-order, model hot-swap",8.5,False,MUT)
p=tf.add_paragraph()
run(p,"OR ordering 4",8.5,True,INK); run(p,"  monotonic seq, late results   ",8.5,False,MUT)
run(p,"SC DPDP 7",8.5,True,VIO); run(p,"  consent gate, no PCM on disk, mTLS   ",8.5,False,MUT)
run(p,"OP ops 6",8.5,True,INK); run(p,"  drain, cardinality, admission",8.5,False,MUT)

card(s2,8.38,5.80,4.52,1.42,GRN,GRNF,1.75)
tf=tbox(s2,8.54,5.92,4.24,1.24)
p=para(tf,True); run(p,"DEFINITION OF DONE",9.5,True,GRN)
for line in ["Every edge case has a test that fails when its handling is removed",
             "1,200 sessions × 30 min inside the latency budget",
             "8-hour soak with flat memory",
             "Live path and offline training front-end produce identical tensors"]:
    p=tf.add_paragraph(); p.space_before=Pt(1.5)
    run(p,"• "+line,8.5,False,INK)

out="docs/streaming_bridge/VoiceShield-Bridge-2slides.pptx"
prs.save(out)
print("saved",out)
