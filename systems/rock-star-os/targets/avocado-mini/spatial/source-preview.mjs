/** Source pixels for the local draft only. No claim of aerial/volumetric output. */
export function drawMiniSourcePreview(canvas,draft,{sceneRevision=0}={}) {
 if(!canvas?.getContext||!draft||!Number.isSafeInteger(draft.revision)||!Number.isFinite(draft.x)||!Number.isFinite(draft.y)||!Number.isSafeInteger(sceneRevision))throw Error('SOURCE_PREVIEW_INPUT_INVALID');
 const c=canvas.getContext('2d');if(!c)throw Error('SOURCE_CANVAS_UNAVAILABLE');
 const w=canvas.width,h=canvas.height;
 c.fillStyle='#101712';c.fillRect(0,0,w,h);c.fillStyle='#aebca6';c.font='16px system-ui';c.textAlign='left';c.fillText('Mini — source raster preview',24,30);
 c.fillStyle='#84917d';c.font='12px system-ui';c.fillText('光学校正前・通常モニター表示',24,53);
 const x=40+draft.x*(w-160),y=90+draft.y*(h-170);
 c.strokeStyle='#a5b497';c.lineWidth=2;c.strokeRect(x-45,y-25,90,50);c.fillStyle='#aebca6';c.fillText('下書き',x-20,y+4);
 c.strokeStyle='#73836e';c.beginPath();c.moveTo(w-180,h-90);c.lineTo(w-130,h-125);c.lineTo(w-80,h-90);c.lineTo(w-80,h-45);c.lineTo(w-180,h-45);c.closePath();c.stroke();
 c.fillStyle='#84917d';c.fillText('建築モデルは2D透視図の例',w-225,h-20);
 return {schema:'rockstaros.source-preview/1',frameId:crypto.randomUUID(),sceneRevision,draftRevision:draft.revision,widthPx:w,heightPx:h,outputKind:'ordinary-monitor-preview',opticalWarpCalibrated:false,volumetricDepthProduced:false,physicalAccepted:false};
}
