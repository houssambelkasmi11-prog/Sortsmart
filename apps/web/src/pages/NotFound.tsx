import { Link } from "react-router-dom";
import { PageHeader } from "../App";

export function NotFound() {
  return (
    <div className="page">
      <PageHeader eyebrow="404" title={<>This page needs <em>review.</em></>} lede="We couldn't place this address in any known route." />
      <p className="page__foot">
        <Link to="/" className="s-btn">
          Back home
        </Link>
      </p>
    </div>
  );
}
