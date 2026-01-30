import { faHouse } from "@fortawesome/free-solid-svg-icons/faHouse";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet } from "react-router-dom";
import { useBreadcrumb } from "../hooks/breadcrumb";

const HuntListApp = () => {
  useBreadcrumb({
    title: <FontAwesomeIcon icon={faHouse} />,
    path: "/hunts",
    hoverText: "List of hunts",
  });
  return <Outlet />;
};

export default HuntListApp;
