const k = 7/5;
const R = 8.3145
const Cv = 5/2 * R;
const maxJoulesPerCycle = 5000;
const cyclesToRun = 250;

class System {
  constructor(vol, mols, temp) {
    this.vol = vol;
    this.mols = mols;
    this.temp = temp;
  }
  get pressure() {
    return this.mols * R * this.temp / this.vol;
  }
  adiabatVolChange(newVol) {
    if(newVol === Infinity) return this;
    const newPressure = this.pressure*(this.vol**k)/(newVol**k);
    this.vol = newVol;
    // @ts-ignore
    const oldT = this.temp;
    this.temp = newPressure * newVol / this.mols / R || 0;
    return this;
  }
  passiveMix(other){
    //Adiabatically mutate both systems according to fake piston vol change
    const thisVol = this.vol;
    const otherVol = other.vol;
    const finalPressure = (this.pressure * this.vol + other.pressure * other.vol)/(this.vol + other.vol);
    //Simulate adiabatic expansion/compression of both systems to equalize temps
    this.adiabatVolChange(this.vol * this.pressure / finalPressure);
    other.adiabatVolChange(other.vol * other.pressure / finalPressure);
    this.vol = thisVol;
    other.vol = otherVol;
    //Then mix systems and separate
    const T = (this.mols * this.temp + other.mols * other.temp) / (this.mols + other.mols);
    const n = this.mols + other.mols;
    const V = this.vol + other.vol;
    this.temp = other.temp = T;
    this.mols = this.vol / V * n;
    other.mols = other.vol / V * n;
    return this;
  }
  oneWayMix(other){
    if(other.pressure > this.pressure) return this;
    const thisVol = this.vol;
    const otherVol = other.vol;
    const finalPressure = Math.min((this.pressure * this.vol + other.pressure * other.vol)/(this.vol + other.vol),this.pressure);
    this.adiabatVolChange(this.vol * this.pressure / finalPressure);
    other.adiabatVolChange(Math.max(other.vol * other.pressure / finalPressure, this.vol));
    this.vol = thisVol;
    other.vol = otherVol;
    //check below
    
    const T = (this.mols * this.temp + other.mols * other.temp) / (this.mols + other.mols);
    const n = this.mols + other.mols;
    const V = this.vol + other.vol;
    this.temp = other.temp = T;
    this.mols = this.vol / V * n;
    other.mols = other.vol / V * n;
  }
}

class Compressor extends System {
  constructor(vol) {
    super(vol, 0, 0);
  }
  poweredInjectTo(other, maxEnergy){
    //Passive combine first, then attempt to force all gas out of this system.
    this.passiveMix(other);
    const oldVol = other.vol;
    other.vol += this.vol;
    other.mols += this.mols;
    const maxPoweredVol = ((maxEnergy * this.temp * R) / (this.pressure * Cv * other.vol**k))**(1/(1-k));
    const newVol = Math.max(oldVol, maxPoweredVol);
    other.adiabatVolChange(newVol);
    //Begin refunding mols if we haven't done a full cycle
    this.mols = other.mols * (newVol - oldVol) / newVol; //should be 0 if newVol === oldVol
    this.temp = other.temp;
    other.vol = oldVol;
    other.mols -= this.mols;
    return this; 
  }
}

const chartConfig = label => {
  return {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options:{
      plugins: {
        title: {
          display: true,
          text: label + ' over Time'
        }
      }
    },
    plugins: []
  }
}

const charts = {
  // @ts-ignore
  mols: new Chart(document.getElementById('mols-chart').getContext('2d'), chartConfig('Mols')),
  // @ts-ignore
  pressure: new Chart(document.getElementById('pressure-chart').getContext('2d'), chartConfig('Pressure')),
  // @ts-ignore
  temperature: new Chart(document.getElementById('temp-chart').getContext('2d'), chartConfig('Temperature'))
}

const inElVol = document.getElementById('in-vol');
const inElMols = document.getElementById('in-mols');
const inElTemp = document.getElementById('in-temp');
const compElVol = document.getElementById('cyl-vol');
const outElVol = document.getElementById('out-vol');
const outElMols = document.getElementById('out-mols');
const outElTemp = document.getElementById('out-temp');

function runExperiment() {
  // @ts-ignore
  const inSys = new System(inElVol.valueAsNumber, inElMols.valueAsNumber, inElTemp.valueAsNumber);
  // @ts-ignore
  const outSys = new System(outElVol.valueAsNumber, outElMols.valueAsNumber, outElTemp.valueAsNumber);
  // @ts-ignore
  const cylSys = new Compressor(compElVol.valueAsNumber);

  const labels = Array(cyclesToRun + 1);
  for(let i = 0; i < labels.length; i++) {
    labels[i] = i;
  }
  class DataItem {
    constructor(label, hue){
      this.label = label;
      this.in = [];
      this.out = [];
      this.hue = hue || 0;
    }
    set() {
      const datasets = [];
      datasets.push({
        label: this.label + " In",
        data: this.in,
        backgroundColor: `hsl(${this.hue}, 100%, 60%)`,
        borderColor: `hsl(${this.hue}, 100%, 60%)`
      });
      datasets.push({
        label: this.label + " Out",
        data: this.out,
        backgroundColor: `hsl(${this.hue + 5}, 100%, 30%)`,
        borderColor: `hsl(${this.hue + 5}, 100%, 30%)`
      });
      return datasets;
    }
  }
  const data = {
    pressure: new DataItem("Pressure", 230),
    mols: new DataItem('Mols', 0),
    temperature: new DataItem('Temperature', 135),
    record(){
      this.pressure.in.push(inSys.pressure);
      this.pressure.out.push(outSys.pressure);
      this.mols.in.push(inSys.mols);
      this.mols.out.push(outSys.mols);
      this.temperature.in.push(inSys.temp);
      this.temperature.out.push(outSys.temp);
    }
  }
  for(let cycle = 1; cycle <= cyclesToRun; cycle++) {
    inSys.passiveMix(cylSys);
    cylSys.poweredInjectTo(outSys, maxJoulesPerCycle);
    data.record();
  }
  //All data is recorded, just need to push into chart
  for(const key of Object.keys(charts)){
    charts[key].data = {
      labels: labels,
      datasets: data[key].set()
    }
    charts[key].plugins = [{
      id: 'background-colour',
      beforeDraw: (chart) => {
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      }
    }]
    charts[key].update();
  }
}
runExperiment();