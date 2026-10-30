import './style.css';
import { Game } from './game/Game';
try { new Game(); }
catch (error) {
  console.error(error);
  const el=document.createElement('div');el.className='error-screen';
  el.innerHTML='<h1 style="font-size:40px">TIVON - GTA</h1><p>The 3D world could not start. Enable WebGL/hardware acceleration and reload.</p><p>לא ניתן לפתוח את העולם. יש להפעיל האצת חומרה ולטעון מחדש.</p>';
  const details=document.createElement('pre');details.textContent=String(error);el.append(details);document.body.append(el);
}
