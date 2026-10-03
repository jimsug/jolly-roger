import { faHouse } from "@fortawesome/free-solid-svg-icons/faHouse";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { useBreadcrumb } from "../hooks/breadcrumb";

// A stable element, so the crumb isn't re-published on every render
const HomeIcon = <FontAwesomeIcon icon={faHouse} />;

const HuntListApp = () => {
  const { t } = useTranslation();
  useBreadcrumb({
    title: HomeIcon,
    path: "/hunts",
    hoverText: t("huntList.breadcrumbHoverText", "List of hunts"),
  });
  return <Outlet />;
};

export default HuntListApp;
