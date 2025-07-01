import * as fabric from 'fabric';

export class RoundedTextbox extends fabric.Textbox {
  static override type = 'RoundedTextbox';
  backgroundPadding: number;

  constructor(text: string, options: fabric.ITextboxOptions & { backgroundPadding?: number }) {
    super(text, options);
    this.backgroundPadding = options.backgroundPadding || 0;
  }

  // toObject(propertiesToInclude?: string[]) {
  //   return super.toObject([...propertiesToInclude, 'backgroundPadding']);
  // }

  protected override _renderBackground(ctx: CanvasRenderingContext2D) {
    if (!this.backgroundColor) {
      return;
    }
    const dim = this._getNonTransformedDimensions();
    const w = dim.x + 2 * this.padding;
    const h = dim.y + 2 * this.padding;

    ctx.save();
    ctx.fillStyle = this.backgroundColor.toString();

    const x = -this.width / 2 - this.padding;
    const y = -this.height / 2 - this.padding;
    const radius = 10;

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

fabric.classRegistry.setClass(RoundedTextbox, 'RoundedTextbox');
fabric.classRegistry.setSVGClass(RoundedTextbox, 'RoundedTextbox');
