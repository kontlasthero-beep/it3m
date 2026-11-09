Add-Type -AssemblyName System.Drawing

$sourceSlot = Join-Path $PSScriptRoot "..\deck-redesign\deck-slot-v2.png"
$sourcePortrait = Join-Path $PSScriptRoot "..\deck-redesign\hero-portrait-frame-v2.png"

$palette = @(
  @{ Id = "big-boy"; SurfaceHue = 218; SurfaceSat = 0.10; EdgeHue = 218; EdgeSat = 0.22 },
  @{ Id = "trap-master"; SurfaceHue = 276; SurfaceSat = 0.36; EdgeHue = 282; EdgeSat = 0.48 },
  @{ Id = "hunter"; SurfaceHue = 28; SurfaceSat = 0.34; EdgeHue = 31; EdgeSat = 0.50 },
  @{ Id = "joker"; SurfaceHue = 112; SurfaceSat = 0.32; EdgeHue = 102; EdgeSat = 0.47 },
  @{ Id = "refiner"; SurfaceHue = 43; SurfaceSat = 0.40; EdgeHue = 46; EdgeSat = 0.57 }
)

$csharp = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class HeroHudRecolor {
  private static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

  private static double[] ToHsl(double r, double g, double b) {
    r /= 255.0; g /= 255.0; b /= 255.0;
    double max = Math.Max(r, Math.Max(g, b));
    double min = Math.Min(r, Math.Min(g, b));
    double h = 0, s = 0, l = (max + min) / 2.0;
    if (max != min) {
      double d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      if (max == r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max == g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return new[] { h, s, l };
  }

  private static double HueToRgb(double p, double q, double t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1.0 / 6) return p + (q - p) * 6 * t;
    if (t < 1.0 / 2) return q;
    if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
    return p;
  }

  private static void FromHsl(double h, double s, double l, out byte r, out byte g, out byte b) {
    h = (h % 360 + 360) % 360 / 360.0;
    double rr, gg, bb;
    if (s == 0) rr = gg = bb = l;
    else {
      double q = l < .5 ? l * (1 + s) : l + s - l * s;
      double p = 2 * l - q;
      rr = HueToRgb(p, q, h + 1.0 / 3);
      gg = HueToRgb(p, q, h);
      bb = HueToRgb(p, q, h - 1.0 / 3);
    }
    r = (byte)Math.Round(Clamp(rr * 255, 0, 255));
    g = (byte)Math.Round(Clamp(gg * 255, 0, 255));
    b = (byte)Math.Round(Clamp(bb * 255, 0, 255));
  }

  public static void Recolor(string input, string output, double surfaceHue, double surfaceSat, double edgeHue, double edgeSat) {
    using (Image source = Image.FromFile(input))
    using (Bitmap bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb)) {
      using (Graphics graphics = Graphics.FromImage(bitmap)) {
        graphics.Clear(Color.Transparent);
        graphics.DrawImage(source, new Rectangle(0, 0, source.Width, source.Height));
      }
      Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
      BitmapData data = bitmap.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      try {
        int stride = data.Stride;
        byte[] pixels = new byte[Math.Abs(stride) * bitmap.Height];
        Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
        for (int y = 0; y < bitmap.Height; y++) {
          int row = y * stride;
          for (int x = 0; x < bitmap.Width; x++) {
            int i = row + x * 4;
            byte alpha = pixels[i + 3];
            if (alpha < 12) continue;
            double[] hsl = ToHsl(pixels[i + 2], pixels[i + 1], pixels[i]);
            bool surface = hsl[1] >= .07 && hsl[0] >= 126 && hsl[0] <= 210;
            bool edge = hsl[1] >= .16 && hsl[0] >= 7 && hsl[0] <= 48;
            if (!surface && !edge) continue;
            double targetHue = surface ? surfaceHue : edgeHue;
            double targetSat = surface ? surfaceSat : edgeSat;
            double sat = Clamp(targetSat * (.58 + (1 - hsl[2]) * .34) + hsl[1] * .12, .045, .82);
            FromHsl(targetHue, sat, hsl[2], out byte r, out byte g, out byte b);
            pixels[i] = b; pixels[i + 1] = g; pixels[i + 2] = r;
          }
        }
        Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
      } finally { bitmap.UnlockBits(data); }
      bitmap.Save(output, ImageFormat.Png);
    }
  }
}
'@

if (-not ("HeroHudRecolor" -as [type])) {
  # PowerShell 7 on current Windows runtimes loads System.Drawing.Common from
  # its runtime directory; `System.Drawing` is only a forwarded assembly name.
  $drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
  $drawingDirectory = [System.IO.Path]::GetDirectoryName($drawingAssembly)
  $drawingReferences = @(
    $drawingAssembly,
    [System.Drawing.Color].Assembly.Location,
    (Join-Path $drawingDirectory "System.Private.Windows.GdiPlus.dll"),
    (Join-Path $drawingDirectory "System.Private.Windows.Core.dll")
  )
  Add-Type -TypeDefinition $csharp -ReferencedAssemblies $drawingReferences -ErrorAction Stop
}

foreach ($hero in $palette) {
  [HeroHudRecolor]::Recolor($sourceSlot, (Join-Path $PSScriptRoot "slot-$($hero.Id).png"), $hero.SurfaceHue, $hero.SurfaceSat, $hero.EdgeHue, $hero.EdgeSat)
  [HeroHudRecolor]::Recolor($sourcePortrait, (Join-Path $PSScriptRoot "portrait-frame-$($hero.Id).png"), $hero.SurfaceHue, $hero.SurfaceSat, $hero.EdgeHue, $hero.EdgeSat)
}

Write-Output "Generated 10 texture-preserving hero HUD frames in $PSScriptRoot"
