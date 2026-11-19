// Optical-coordinate planning only. No Bridge calls, capture, app actions or billing.
// A real source's calibrated ray/depth renderer must consume this mapping; a quilt
// raster cannot be resized to perform this optical depth compensation.
export function createLeairrPrewarp({focalLengthMm=300,sourceDistanceMm=150,maxOutputDepthOffsetMm=20}={}){
 const valid=n=>typeof n==='number'&&Number.isFinite(n);
 if(![focalLengthMm,sourceDistanceMm,maxOutputDepthOffsetMm].every(valid)||focalLengthMm<=0||sourceDistanceMm<=0||sourceDistanceMm>=focalLengthMm||maxOutputDepthOffsetMm<=0||maxOutputDepthOffsetMm>20)throw Error('OPTICAL_PRESCRIPTION_INVALID');
 const nominalB=focalLengthMm*sourceDistanceMm/(focalLengthMm-sourceDistanceMm);
 if(!valid(nominalB)||nominalB<=maxOutputDepthOffsetMm)throw Error('VIRTUAL_IMAGE_RANGE_INVALID');
 function planPoint({xMm,yMm,depthOffsetMm}){
  if(![xMm,yMm,depthOffsetMm].every(valid)||Math.abs(depthOffsetMm)>maxOutputDepthOffsetMm)throw Error('POINT_OUTSIDE_DEPTH_STUDY');
  // Positive depth means increasing distance from BS in the unfolded image frame.
  const b=nominalB+depthOffsetMm,a=focalLengthMm*b/(focalLengthMm+b),m=1+b/focalLengthMm;
  return {sourceOpticalPointMm:[xMm/m,yMm/m,sourceDistanceMm-a],lateralMagnification:m,physicalEligible:false,requiresMeasuredRayCalibration:true};
 }
 return Object.freeze({planPoint,nominalVirtualDistanceMm:nominalB,nominalLateralMagnification:nominalB/sourceDistanceMm,stage:'optical-coordinate-plan',bridgeImplemented:false});
}
