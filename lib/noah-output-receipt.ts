import {noahResultImageLinks} from './noah-result-presentation.ts';
import { noahResultImage, type NoahReceivedResult } from './noah-result-media.ts';
/** A curated output contract, never inferred from instructions inside a result. */
export function noahExpectsImage(host:string|null,tool:string|null){
  return (host==='arabickeyboard.ai'||host==='www.arabickeyboard.ai')&&tool==='write_name_in_arabic';
}
export function noahDelivery(host:string|null,tool:string|null,result?:NoahReceivedResult):'missing_image'|undefined{
  if(!noahExpectsImage(host,tool))return undefined;
  const images=result?.images?.some((image,index)=>Boolean(noahResultImage({type:'image',...image},index)));
  const links=result?[...(result.imageUrls??[]),...noahResultImageLinks(result.text)].filter(url=>noahResultImageLinks(JSON.stringify({image_url:url})).length>0):[];
  return images||links.length?undefined:'missing_image';
}
