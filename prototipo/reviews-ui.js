import {state,request,escapeHTML as E} from './server-ui.js';
import {customerError} from './client-request.js';
let render=()=>{},user=null,data=null,loading=false,busy=false,generation=0,draftRating=0,draftBody='',feedback='',failure=null;
const say=(es,en)=>document.documentElement.lang==='en'?en:es;
function sync(){
 const id=state.user?.id||null;if(id===user)return;
 user=id;data=null;loading=false;busy=false;draftRating=0;draftBody='';feedback='';failure=null;generation++;
}
async function load(){
 sync();if(loading)return;const run=++generation;loading=true;
 try{
  const result=await request('/api/reviews');sync();if(run!==generation)return;
  data=result;if(result.mine){draftRating=result.mine.rating;draftBody=result.mine.body;}
 }catch(err){sync();if(run===generation)failure=err;}
 finally{if(run===generation){loading=false;render();}}
}
export function reviewsLink(){return `<a class="menu-link card" href="#review"><span>☆ ${say('Valora tu experiencia · Reseñas','Rate your experience · Reviews')}</span><span aria-hidden="true">→</span></a>`;}
export function reviewsContent(){
 sync();
 if(!state.user)return `<h1>${say('Reseñas','Reviews')}</h1><a class="button" href="#login">${say('Inicia sesión','Sign in')}</a>`;
 if(!data&&!loading&&!failure)void load();
 const language=document.documentElement.lang;
 const status=feedback==='saved'?say('Tu reseña se ha publicado. Gracias por compartir tu experiencia.','Your review has been published. Thank you for sharing your experience.'):feedback==='deleted'?say('Tu reseña se ha eliminado.','Your review has been deleted.'):'';
 return `<h1>${say('Reseñas de clientes','Customer reviews')}</h1><p>${say('Opiniones de clientes con una cita atendida. Se aceptan todas las valoraciones del 1 al 5, sin premios por puntuar.','Reviews from customers with a completed appointment. All ratings from 1 to 5 are welcome, with no rewards for ratings.')}</p>
 ${failure?`<p class="warning" role="alert">${E(customerError(failure,language))}</p><button class="button secondary" data-review-refresh>${say('Reintentar','Try again')}</button>`:''}
 ${status?`<p role="status">${status}</p>`:''}
 ${loading?`<p role="status">${say('Cargando reseñas…','Loading reviews…')}</p>`:''}
 ${data?`<section class="card"><h2>${data.total?`${E(data.average)} / 5 · ${E(data.total)} ${say('reseñas','reviews')}`:say('Todavía no hay reseñas','No reviews yet')}</h2></section>
 ${data.eligible?`<form class="card review-form" data-review-form ${busy?'aria-busy="true"':''}><h2>${data.mine?say('Editar mi reseña','Edit my review'):say('Comparte tu experiencia','Share your experience')}</h2><fieldset class="review-stars" ${busy?'disabled':''}><legend>${say('Tu valoración','Your rating')}</legend>${[1,2,3,4,5].map(rating=>`<label><input type="radio" name="rating" value="${rating}" ${draftRating===rating?'checked':''} required><span aria-hidden="true">${rating<=draftRating?'★':'☆'}</span><span>${rating} ${rating===1?say('estrella','star'):say('estrellas','stars')}</span></label>`).join('')}</fieldset><label class="field-label">${say('Tu reseña','Your review')}<textarea name="body" maxlength="1000" required ${busy?'disabled':''}>${E(draftBody)}</textarea></label><small>${say('Máximo 1000 caracteres. Tu nombre de pila y tu opinión serán visibles para otros usuarios. No incluyas teléfonos ni datos privados.','Maximum 1000 characters. Your first name and review will be visible to other users. Do not include phone numbers or private information.')}</small><button class="button full" ${busy?'disabled':''}>${data.mine?say('Actualizar reseña','Update review'):say('Publicar reseña','Publish review')}</button>${data.mine?`<button class="text-button danger" type="button" data-review-delete ${busy?'disabled':''}>${say('Eliminar mi reseña','Delete my review')}</button>`:''}</form>`:state.user.role==='customer'?`<p class="warning">${say('Podrás escribir tu reseña cuando el barbero marque una de tus citas como atendida.','You can write your review once the barber marks one of your appointments as completed.')}</p>`:''}
 <section class="review-list" aria-label="${say('Opiniones publicadas','Published reviews')}">${data.reviews.map(review=>`<article class="card"><h3>${E(review.name)}</h3><p aria-label="${E(review.rating)} ${say('de 5 estrellas','out of 5 stars')}">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</p><p class="review-body">${E(review.body)}</p><small>${E(new Date(review.createdAt).toLocaleDateString(language==='en'?'en-US':'es-US'))}</small></article>`).join('')}</section>`:''}`;
}
export function installReviewsUI(callback){
 render=()=>{if(location.hash==='#review')callback();};
 const app=document.querySelector('#app');
 window.addEventListener('hashchange',()=>{if(location.hash==='#review'&&!busy)void load();});
 app.addEventListener('input',event=>{
  if(!event.target.closest('[data-review-form]'))return;
  if(event.target.name==='body')draftBody=event.target.value;
  if(event.target.name==='rating'){
   draftRating=Number(event.target.value);
   for(const radio of app.querySelectorAll('[data-review-form] [name=rating]'))radio.nextElementSibling.textContent=Number(radio.value)<=draftRating?'★':'☆';
  }
 });
 async function save(remove=false){
  sync();if(busy)return;const id=user;busy=true;failure=null;feedback='';render();
  try{
   await request('/api/reviews/me',{method:remove?'DELETE':'PUT',...(!remove?{body:{rating:draftRating,body:draftBody}}:{})});
   sync();if(id!==user)return;
   feedback=remove?'deleted':'saved';if(remove){draftRating=0;draftBody='';}
   data=null;await load();
  }catch(err){sync();if(id===user)failure=err;}
  finally{sync();if(id===user){busy=false;render();}}
 }
 app.addEventListener('submit',event=>{
  if(!event.target.hasAttribute('data-review-form'))return;event.preventDefault();void save();
 });
 app.addEventListener('click',event=>{
  if(event.target.closest('[data-review-delete]')&&!busy&&confirm(say('¿Eliminar tu reseña?','Delete your review?')))void save(true);
  if(event.target.closest('[data-review-refresh]')&&!busy){failure=null;void load();}
 });
}
