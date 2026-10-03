import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import type React from "react";
import { useEffect, useState } from "react";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Row from "react-bootstrap/Row";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router";
import App from "./App";
import SplashPage from "./SplashPage";

export const useAuthenticated = () => {
  const { loggingIn, loggedIn } = useTracker(() => {
    return {
      loggingIn: Meteor.loggingIn(),
      loggedIn: !!Meteor.userId(),
    };
  }, []);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we're done logging in
    if (loading && !loggingIn) {
      setLoading(false);
    }
  }, [loading, loggingIn]);

  return [loading, loggedIn];
};

export const AuthenticatedPage = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [loading, loggedIn] = useAuthenticated();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!loggedIn) {
    const { pathname, search } = location;
    return <Navigate to="/login" state={{ pathname, search }} />;
  }

  return <App>{children}</App>;
};

export const UnauthenticatedPage = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [loading, loggedIn] = useAuthenticated();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (loggedIn) {
    const { pathname = "/", search } = location.state ?? {};
    return <Navigate to={{ pathname, search }} />;
  }

  return <SplashPage>{children}</SplashPage>;
};

/* Renders the same whether or not anyone is logged in */
export const PublicPage = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();

  return (
    <Container>
      <Navbar>
        <Link to="/">{t("publicPage.homeLink", "Jolly Roger")}</Link>
      </Navbar>
      <Row>
        <Col>{children}</Col>
      </Row>
    </Container>
  );
};
