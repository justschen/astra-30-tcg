import * as THREE from 'three';
import { CARD_BY_ID, faceSlots, spreadFaces, SHEET_COUNT } from './collection.js';
import { selectedFromHand } from './hand.js';
import { fabricTexture, plasticNormalTexture, roundedBox, setCardHeld, textTexture } from './materials.js';

export const PAGE_W = 2.12;
export const PAGE_H = 2.98;
const GAP = .065;
const PAGE_Y = .22;
const CARD_W = .585;
const CARD_H = CARD_W * 88 / 63;

export function binderLiftPose(amount) {
  const progress = Math.max(0, Math.min(1, amount));
  return { position: [0, .607 + progress * 1.793, .7 + progress * 1.3], rotation: progress * 1.02 };
}

export class Binder {
  constructor(parent, textures, assets) {
    this.textures = textures;
    this.group = new THREE.Group();
    this.group.position.set(0, .607, .7);
    this.lift = 0;
    this.liftTarget = 0;
    parent.add(this.group);
    this.targets = [];
    this.pockets = [];
    this.faces = [];
    this.state = null;
    this.turn = null;
    this.hand = [];
    this.selected = null;
    this.handSet = new Set();
    this.highlighted = null;
    const fabric = fabricTexture('#e2dfd5');
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
    fabric.repeat.set(3, 4);
    this.paper = new THREE.MeshStandardMaterial({ color: 0xe8e7df, map: fabric, roughness: .93, bumpMap: fabric, bumpScale: .008 });
    this.leather = new THREE.MeshPhysicalMaterial({
      color: 0xf4f1e9, map: assets['leather-color'], normalMap: assets['leather-normal'],
      normalScale: new THREE.Vector2(.22, .22), roughnessMap: assets['leather-roughness'], roughness: .86, clearcoat: .06,
    });
    this.gold = new THREE.MeshStandardMaterial({ color: 0xd8b873, metalness: .93, roughness: .36 });
    this.seam = new THREE.LineBasicMaterial({ color: 0x959b97, transparent: true, opacity: .3 });
    this.plasticNormal = plasticNormalTexture();
    this.clear = new THREE.MeshPhysicalMaterial({
      color: 0xf5f9f8, transparent: true, opacity: .045, roughness: .25, metalness: .01,
      clearcoat: .35, clearcoatRoughness: .28, normalMap: this.plasticNormal, normalScale: new THREE.Vector2(.12, .12),
      depthWrite: false, envMapIntensity: .35, specularIntensity:.4,
    });
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x657078, opacity: .12, transparent: true, depthWrite: false });
    this.hoverMaterial = new THREE.LineBasicMaterial({ color: 0xd8ba7c, transparent: true, opacity: .9 });
    this.preview = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.visible = false;
    this.group.add(this.preview);
    this.buildCovers();
  }

  buildCovers() {
    for (const sign of [-1, 1]) {
      const center = sign * (PAGE_W / 2 + .105);
      roundedBox(this.group, [PAGE_W + .22, .125, PAGE_H + .26], [center, .01, 0], this.leather, .09);
      roundedBox(this.group, [PAGE_W + .12, .016, PAGE_H + .15], [center, .087, 0], this.paper, .045);
      const width = PAGE_W + .19, height = PAGE_H + .235;
      const points = [];
      const r = .095;
      for (let corner = 0; corner < 4; corner++) {
        const cx = corner < 2 ? width / 2 - r : -width / 2 + r;
        const cz = corner === 0 || corner === 3 ? -height / 2 + r : height / 2 - r;
        const start = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][corner];
        for (let j = 0; j <= 8; j++) {
          const a = start + j / 8 * Math.PI / 2;
          points.push(new THREE.Vector3(center + cx + Math.cos(a) * r, .005, cz + Math.sin(a) * r));
        }
      }
      const curve = new THREE.CatmullRomCurve3(points, true);
      const piping = new THREE.Mesh(new THREE.TubeGeometry(curve, 130, .02, 5, true), this.gold);
      this.group.add(piping);
      const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(.023, .032, .027), this.gold, 240);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 240; i++) {
        const p = curve.getPointAt(i / 240);
        const tangent = curve.getTangentAt(i / 240);
        dummy.position.copy(p); dummy.rotation.y = Math.atan2(tangent.x, tangent.z); dummy.updateMatrix();
        teeth.setMatrixAt(i, dummy.matrix);
      }
      this.group.add(teeth);
      const stitchPoints = [];
      for (let i = 0; i < 220; i++) {
        const p = curve.getPointAt(i / 220), q = curve.getPointAt((i + .42) / 220);
        p.x += (center - p.x) * .025; q.x += (center - q.x) * .025;
        p.z *= .973; q.z *= .973; p.y = q.y = .078;
        stitchPoints.push(p, q);
      }
      this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stitchPoints), new THREE.LineBasicMaterial({ color: 0xc2aa71 })));
      const template = roundedBox(this.group, [PAGE_W, .004, PAGE_H], [0,0,0], this.paper, .01);
      template.removeFromParent();
      const layers = new THREE.InstancedMesh(template.geometry, this.paper, SHEET_COUNT);
      layers.name = 'Stacked binder sheets'; layers.castShadow = layers.receiveShadow = true;
      layers.userData.sheetSide = sign;
      for (let sheet = 0; sheet < SHEET_COUNT; sheet++) {
        dummy.position.set(sign * (PAGE_W / 2 + GAP), .105 + sheet * .005, sheet * .0008);
        dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();layers.setMatrixAt(sheet,dummy.matrix);
      }
      layers.computeBoundingBox();layers.computeBoundingSphere();
      this.group.add(layers);
      const coverPrint = new THREE.Mesh(new THREE.PlaneGeometry(1.38, .66), new THREE.MeshBasicMaterial({
        map: textTexture('AFTERHOURS\nANNIVERSARY EDITION\n1996 / 2026', { width: 512, height: 230, size: 36 }),
        transparent: true, depthWrite: false, toneMapped: false,
      }));
      coverPrint.rotation.x = -Math.PI / 2;
      coverPrint.position.set(center, .098, .1);
      this.group.add(coverPrint);
      coverPrint.userData.coverSide = sign;
    }
    roundedBox(this.group, [.18, .1, PAGE_H + .06], [0, .025, 0], this.leather, .04);
    const pull = new THREE.Group();
    pull.position.set(PAGE_W + .28, .014, PAGE_H / 2 + .08);
    pull.rotation.y = -.42;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(.045, .012, 7, 16), this.gold);
    loop.rotation.x = Math.PI / 2;
    pull.add(loop);
    roundedBox(pull, [.085, .025, .2], [0, -.006, .115], this.gold, .025);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(.032, .055), new THREE.MeshBasicMaterial({ color: 0x564c37 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(0, .009, .16); pull.add(hole);
    this.group.add(pull);
  }

  setLifted(lifted) { this.liftTarget = lifted ? 1 : 0; }

  updatePose(delta, reducedMotion = false) {
    if (this.lift === this.liftTarget) return false;
    this.lift = reducedMotion ? this.liftTarget : THREE.MathUtils.lerp(this.lift, this.liftTarget, 1 - Math.exp(-delta * 9));
    if (Math.abs(this.lift - this.liftTarget) < .0001) this.lift = this.liftTarget;
    const pose = binderLiftPose(this.lift);
    this.group.position.set(...pose.position);
    this.group.rotation.x = pose.rotation;
    this.clear.opacity = .045 - this.lift * .018;
    this.clear.roughness = .25 + this.lift * .1;
    return true;
  }

  createFace(face, x, y, interactive) {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    const page = roundedBox(group, [PAGE_W, .013, PAGE_H], [0, 0, 0], this.paper, .025);
    page.castShadow = false;
    const pockets = [];
    for (const [pocket, index] of faceSlots(face).entries()) {
      const column = pocket % 3, row = Math.floor(pocket / 3);
      const px = (column - 1) * .676, pz = (row - 1) * .932;
      const cell = new THREE.Group();
      cell.position.set(px, .012, pz);
      group.add(cell);
      const id = this.state.slots[index];
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.612, .852), this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = .003;
      cell.add(shadow);
      if (id) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), this.textures.material(id));
        card.rotation.x = -Math.PI / 2;
        card.position.y = .007;
        card.userData.cardId = id;
        cell.add(card);
      } else {
        const number = new THREE.Mesh(new THREE.PlaneGeometry(.16, .085), new THREE.MeshBasicMaterial({
          map: textTexture(String(pocket + 1).padStart(2, '0'), { width: 64, height: 32, color: '#9e998b', size: 19 }),
          transparent: true, depthWrite: false,
        }));
        number.rotation.x = -Math.PI / 2; number.position.set(0, .009, .005);
        number.userData.ownTexture = true;
        cell.add(number);
      }
      const plasticGeometry = new THREE.PlaneGeometry(.634, .873, 6, 8);
      const surface = plasticGeometry.attributes.position;
      for (let i = 0; i < surface.count; i++) {
        const x = surface.getX(i), y = surface.getY(i);
        surface.setZ(i, Math.sin(x * 9 + y * 2.4) * Math.sin(y * 7) * .0017);
      }
      plasticGeometry.computeVertexNormals();
      const plastic = new THREE.Mesh(plasticGeometry, this.clear);
      plastic.rotation.x = -Math.PI / 2; plastic.position.y = .015;
      cell.add(plastic);
      const perimeter = [
        new THREE.Vector3(-.322, .016, -.442), new THREE.Vector3(.322, .016, -.442),
        new THREE.Vector3(.322, .016, .442), new THREE.Vector3(-.322, .016, .442),
      ];
      const seams = new THREE.Line(new THREE.BufferGeometry().setFromPoints(perimeter), this.seam);
      cell.add(seams);
      const opening = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-.307, .017, -.426), new THREE.Vector3(-.307, .017, .426),
      ]), new THREE.LineBasicMaterial({ color: 0xf6f3e5, transparent: true, opacity: .45 }));
      cell.add(opening);
      const highlight = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(perimeter), this.hoverMaterial);
      highlight.visible = false;
      highlight.position.y = .012;
      cell.add(highlight);
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(.645, .885), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      hit.rotation.x = -Math.PI / 2; hit.position.y = .025; hit.userData = { kind: 'slot', index };
      cell.add(hit);
      if (interactive) this.targets.push(hit);
      pockets.push({ index, cell, hit, highlight, px });
    }
    this.faces.push(group);
    if (interactive) this.pockets.push(...pockets);
    return { group, pockets };
  }

  disposeFace(group) {
    group.traverse(object => {
      object.geometry?.dispose();
      const material = object.material;
      if (!material || [this.paper, this.clear, this.shadowMat, this.seam, this.hoverMaterial].includes(material)) return;
      if (material.userData.cardId) this.textures.release(material);
      else {
        if (object.userData.ownTexture) material.map?.dispose();
        material.dispose();
      }
    });
    group.removeFromParent();
  }

  clearFaces() {
    this.preview.visible = false;
    this.faces.forEach(group => this.disposeFace(group));
    this.faces = [];
    this.pockets = [];
    this.targets = [];
    if (this.edges) {
      this.edges.forEach(edge => { edge.geometry.dispose(); edge.material.dispose(); edge.removeFromParent(); });
    }
    this.edges = [];
  }

  pageHeight(face) {
    const sheets = face % 2 ? Math.floor(face / 2) + 1 : SHEET_COUNT - face / 2;
    return .112 + sheets * .005;
  }

  renderStatic(left, right, interactive = true) {
    for (const [face, side] of [[left, -1], [right, 1]]) {
      if (face !== null && face >= 0 && face < SHEET_COUNT * 2) {
        const { group } = this.createFace(face, side * (PAGE_W / 2 + GAP), this.pageHeight(face), interactive);
        this.group.add(group);
      }
    }
    this.group.children.forEach(child => {
      if (child.userData.coverSide) child.visible = child.userData.coverSide === -1 ? left === null : right === null;
      if (child.userData.sheetSide) {
        const count = child.userData.sheetSide === -1 ? left === null ? 0 : (left + 1) / 2 : right === null ? 0 : SHEET_COUNT - right / 2;
        child.count = count; child.visible = count > 0;
      }
    });
    if (interactive) {
      for (const [direction, enabled] of [[-1, this.state.spread > 0], [1, this.state.spread < SHEET_COUNT]]) {
        if (!enabled) continue;
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(.16, PAGE_H), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
        edge.position.set(direction * (PAGE_W + GAP - .035), this.pageHeight(direction === -1 ? left : right) + .06, 0);
        edge.rotation.x = -Math.PI / 2;
        edge.userData = { kind: 'edge', direction };
        this.group.add(edge); this.targets.push(edge); this.edges.push(edge);
      }
    }
    this.applyHand();
  }

  sync(state) {
    this.state = state;
    if (this.turn) return;
    this.clearFaces();
    this.renderStatic(...spreadFaces(state.spread));
    this.textures.trim();
  }

  setHand(ids, selectedId = ids[0]) {
    const selection = selectedFromHand(ids, selectedId);
    const changedSelection = selection !== this.selected;
    this.selected = selection;
    this.hand = [...ids];
    this.handSet = new Set(ids);
    if (changedSelection) {
      if (this.preview.material.userData.cardId) this.textures.release(this.preview.material);
      else this.preview.material.dispose();
      this.preview.material = selection ? this.textures.material(selection) : new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      if (selection) {
        setCardHeld(this.preview.material, true);
        this.preview.material.opacity = .6;
        this.preview.material.depthWrite = false;
      }
    }
    this.applyHand();
    this.highlight(this.highlighted);
  }

  applyHand() {
    this.faces.forEach(face => face.traverse(object => {
      if (object.userData.cardId) {
        object.visible = true; setCardHeld(object.material, this.handSet.has(object.userData.cardId));
      }
    }));
  }

  highlight(index) {
    this.highlighted = index;
    this.pockets.forEach(pocket => { pocket.highlight.visible = pocket.index === index; });
    const pocket = this.pockets.find(item => item.index === index);
    this.preview.visible = Boolean(pocket && !this.turn && this.hand.length && (!this.state.slots[index] || this.handSet.has(this.state.slots[index])));
    if (this.preview.visible) {
      const parent = pocket.cell.parent;
      this.preview.position.set(parent.position.x + pocket.cell.position.x, parent.position.y + pocket.cell.position.y + .028, pocket.cell.position.z);
    }
  }

  beginTurn(direction) {
    if (this.turn || this.state.spread + direction < 0 || this.state.spread + direction > SHEET_COUNT) return false;
    this.clearFaces();
    const spread = this.state.spread;
    const front = direction === 1 ? spread * 2 : spread * 2 - 2;
    const left = front - 1;
    const right = front + 2;
    this.renderStatic(left < 0 ? null : left, right >= SHEET_COUNT * 2 ? null : right, false);
    const pivot = new THREE.Group();
    pivot.position.y = PAGE_Y + .037;
    const frontFace = this.createFace(front, PAGE_W / 2 + GAP, .012, false);
    const backFace = this.createFace(front + 1, PAGE_W / 2 + GAP, -.013, false);
    backFace.group.rotation.z = Math.PI;
    pivot.add(frontFace.group, backFace.group);
    this.group.add(pivot);
    this.turn = { direction, progress: 0, pivot, front: frontFace, back: backFace, frontHeight: this.pageHeight(front), backHeight: this.pageHeight(front + 1), settling: null };
    this.setTurnProgress(0);
    return true;
  }

  setTurnProgress(progress) {
    if (!this.turn) return;
    const turn = this.turn;
    turn.progress = THREE.MathUtils.clamp(progress, 0, 1);
    const t = turn.direction === 1 ? turn.progress : 1 - turn.progress;
    turn.pivot.rotation.z = t * Math.PI;
    turn.pivot.position.y = THREE.MathUtils.lerp(turn.frontHeight, turn.backHeight, t) + .016 + Math.sin(t * Math.PI) * .045;
    const flex = Math.sin(t * Math.PI) * .025;
    for (const face of [turn.front, turn.back]) {
      face.pockets.forEach(pocket => {
        pocket.cell.rotation.z = Math.sin((pocket.px / PAGE_W + .5) * Math.PI) * flex;
      });
    }
  }

  settleTurn(complete, now, reduced = false) {
    if (!this.turn) return;
    this.turn.settling = { from: this.turn.progress, to: complete ? 1 : 0, start: now, duration: reduced ? 1 : 560 * Math.max(.3, complete ? 1 - this.turn.progress : this.turn.progress) };
  }

  update(now) {
    if (!this.turn?.settling) return null;
    const { from, to, start, duration } = this.turn.settling;
    const t = Math.min(1, (now - start) / duration);
    const ease = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    this.setTurnProgress(from + (to - from) * ease);
    if (t < 1) return null;
    const result = { direction: this.turn.direction, completed: to === 1 };
    this.turn.pivot.removeFromParent();
    this.turn = null;
    return result;
  }

  dispose() {
    this.clearFaces();
    this.group.children.filter(child=>child.userData.sheetSide).forEach(child=>child.dispose());
    this.preview.geometry.dispose();
    if (this.preview.material.userData.cardId) this.textures.release(this.preview.material);
    else this.preview.material.dispose();
    this.paper.map.dispose();
    this.plasticNormal.dispose();
    [this.paper, this.leather, this.gold, this.seam, this.clear, this.shadowMat, this.hoverMaterial].forEach(material => material.dispose());
  }
}
