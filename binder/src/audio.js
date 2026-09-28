export class RoomAudio {
  constructor() { this.context = null; this.enabled = false; this.paused = false; this.weather = 'rain'; }

  async toggle() {
    if (!this.context) {
      if (typeof AudioContext === 'undefined') throw new Error('Ambient audio is not supported by this browser.');
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * .08) / 1.025;
        samples[i] = previous * 3;
      }
      this.rain = this.context.createBufferSource();
      this.rain.buffer = buffer; this.rain.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1800;
      this.rain.connect(filter); filter.connect(this.gain); this.rain.start();
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    this.updateGain();
    return this.enabled;
  }

  pause(paused) {
    this.paused = paused; this.updateGain();
  }

  setWeather(weather) { this.weather = weather; this.updateGain(); }

  updateGain() {
    if (!this.context) return;
    const volume = this.weather === 'rain' ? .075 : this.weather === 'fog' ? .025 : .012;
    this.gain.gain.setTargetAtTime(this.enabled && !this.paused ? volume : 0, this.context.currentTime, .4);
  }

  page() {
    if (!this.enabled || !this.context) return;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * .19, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2;
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = .6;
    const gain = this.context.createGain(); gain.gain.value = .085;
    source.connect(filter); filter.connect(gain); gain.connect(this.context.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  dispose() { this.rain?.stop(); if (this.context) void this.context.close(); }
}
