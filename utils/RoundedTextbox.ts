import { Textbox } from 'fabric';

// @ts-ignore
export class RoundedTextbox extends Textbox {
  static override type = 'RoundedTextbox';

  private static readonly RADIUS = 12;
  private static readonly MIN_WIDTH = 50;

  constructor(text: string, options: fabric.ITextboxOptions) {
    super(text, options);
    this._initEventListeners();
    this._adjustDimensions();
  }

  private _initEventListeners() {
    this.on('changed', this._adjustDimensions);
    this.on('editing:exited', this._adjustDimensions);
  }

  private _adjustDimensions() {
    const textWidth = this.calcTextWidth();
    const newWidth = Math.max(RoundedTextbox.MIN_WIDTH, textWidth + this.padding * 2);

    const textHeight = this.calcTextHeight();
    const newHeight = textHeight + this.padding * 2;

    this.set('width', newWidth);
    this.set('height', newHeight);

    this.setCoords();
  }

  toObject(propertiesToInclude: string[] = []) {
    return super.toObject([...propertiesToInclude, 'padding']);
  }

  protected override _renderBackground(ctx: CanvasRenderingContext2D) {
    if (!this.backgroundColor) {
      return;
    }
    ctx.save();
    ctx.fillStyle = this.backgroundColor.toString();

    const x = -this.width / 2;
    const y = -this.height / 2;
    const w = this.width;
    const h = this.height;
    const radius = RoundedTextbox.RADIUS;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
