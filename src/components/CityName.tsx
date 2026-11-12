export default function CityName({ name }: { name: string }) {
  const breakHyphen =
    name === "Rostov-on-Don" ? name.indexOf("-") : name.lastIndexOf("-");
  if (breakHyphen <= 0 || breakHyphen === name.length - 1) return name;

  return (
    <>
      <span className="detail-name-part">{name.slice(0, breakHyphen + 1)}</span>
      <wbr />
      <span className="detail-name-part">{name.slice(breakHyphen + 1)}</span>
    </>
  );
}
