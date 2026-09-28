import cards from '@phosphor-icons/core/assets/regular/cards-three.svg';
import bag from '@phosphor-icons/core/assets/regular/backpack.svg';
import book from '@phosphor-icons/core/assets/regular/book-open.svg';
import left from '@phosphor-icons/core/assets/regular/arrow-left.svg';
import right from '@phosphor-icons/core/assets/regular/arrow-right.svg';
import sound from '@phosphor-icons/core/assets/regular/speaker-high.svg';
import mute from '@phosphor-icons/core/assets/regular/speaker-slash.svg';
import help from '@phosphor-icons/core/assets/regular/question.svg';
import close from '@phosphor-icons/core/assets/regular/x.svg';
import search from '@phosphor-icons/core/assets/regular/magnifying-glass.svg';
import hand from '@phosphor-icons/core/assets/regular/hand.svg';
import undo from '@phosphor-icons/core/assets/regular/arrow-u-up-left.svg';
import check from '@phosphor-icons/core/assets/regular/check.svg';
import moon from '@phosphor-icons/core/assets/regular/moon.svg';
import sun from '@phosphor-icons/core/assets/regular/sun.svg';
import download from '@phosphor-icons/core/assets/regular/download-simple.svg';
import upload from '@phosphor-icons/core/assets/regular/upload-simple.svg';
import grid from '@phosphor-icons/core/assets/regular/grid-nine.svg';
import stack from '@phosphor-icons/core/assets/regular/stack.svg';
import eye from '@phosphor-icons/core/assets/regular/eye.svg';
import external from '@phosphor-icons/core/assets/regular/arrow-square-out.svg';
import room from '@phosphor-icons/core/assets/regular/armchair.svg';
import rotate from '@phosphor-icons/core/assets/regular/arrows-counter-clockwise.svg';
import rain from '@phosphor-icons/core/assets/regular/cloud-rain.svg';
import fog from '@phosphor-icons/core/assets/regular/cloud-fog.svg';
import pause from '@phosphor-icons/core/assets/regular/pause.svg';
import play from '@phosphor-icons/core/assets/regular/play.svg';
import settings from '@phosphor-icons/core/assets/regular/gear-six.svg';

const icons = { cards, bag, book, left, right, sound, mute, help, close, search, hand, undo, check, moon, sun, download, upload, grid, stack, eye, external, room, rotate, rain, fog, pause, play, settings };
export function icon(name) {
  const svg = icons[name];
  if (!svg) throw new Error(`Unknown icon: ${name}`);
  return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
}
