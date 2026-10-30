import { Link } from "react-router-dom";
import { PageHeader } from "../App";

export function NotFound() {
  return (
    <div className="page">
      <PageHeader eyebrow="404" title="Wrong stream." />
      <p className="page__foot">
        <Link to="/" className="btn btn--solid">
          Back home
        </Link>
      </p>
    </div>
  );
}
