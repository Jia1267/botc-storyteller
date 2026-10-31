import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** 房间链接的二维码：白底，手机相机一扫就能进 */
export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div style={{ width: size, height: size, background: '#fff', padding: 6, borderRadius: 10 }} aria-label="房间二维码" dangerouslySetInnerHTML={{ __html: svg }} />;
}
