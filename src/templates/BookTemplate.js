import React, { useEffect, useState, useRef } from "react";
import { graphql, Link } from "gatsby";
import { useInView } from "react-intersection-observer";
import classnames from "classnames";

import { decryptBuffer, createBlobUrl } from "../utils/crypto";
import { fetchWithRetries } from "../utils/fetch";
import Layout from "../components/Layout";
import Logo from "../components/Logo";
import IconSettings from "../components/IconSettings";
import useLocalStorage from "../hooks/useLocalStorage";
import useWindowSize from "../hooks/useWindowSize";

import * as styles from "./BookTemplate.module.css";

const READING_MODE_KEY = "reading_mode";
const READING_MODE_WIDTH = "width";
const READING_MODE_HEIGHT = "height";

export default function BookTemplate(props) {
  const {
    bookMeta: { dimensions, name },
    bookPages,
  } = props.data;
  const [readingMode, setReadingMode] = useLocalStorage(
    READING_MODE_KEY,
    READING_MODE_WIDTH
  );
  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const [navHidden, setNavHidden] = useState(true);

  function onPageClick(e, pageIndex) {
    const windowWidth = window.innerWidth;
    const clickX = e.clientX;
    if (clickX < windowWidth / 10) {
      const currentPageEl = document.getElementById(`page-${pageIndex}`);
      const currentPageTop = currentPageEl.getBoundingClientRect().top;
      if (currentPageTop < -5) {
        currentPageEl.scrollIntoView();
      } else if (pageIndex > 0) {
        const prevPageEl = document.getElementById(`page-${pageIndex - 1}`);
        prevPageEl.scrollIntoView();
      }
    } else if (clickX < (9 * windowWidth) / 10) {
      setNavHidden((flag) => !flag);
    } else {
      const currentPageEl = document.getElementById(`page-${pageIndex}`);
      const currentPageTop = currentPageEl.getBoundingClientRect().top;
      if (currentPageTop > 5) {
        currentPageEl.scrollIntoView();
      } else if (pageIndex < bookPages.edges.length - 1) {
        const nextPageEl = document.getElementById(`page-${pageIndex + 1}`);
        nextPageEl.scrollIntoView();
      }
    }
  }

  function onSettingsButtonClick() {
    setReadingMode(
      readingMode === READING_MODE_WIDTH
        ? READING_MODE_HEIGHT
        : READING_MODE_WIDTH
    );
  }

  return (
    <Layout>
      <Header
        title={name}
        hidden={navHidden}
        onSettingsButtonClick={onSettingsButtonClick}
      />
      {bookPages.edges.map(({ node: { publicURL } }, index) => {
        const [pageWidth, pageHeight] = dimensions[index];
        return (
          <Page
            {...{
              index,
              pageHeight,
              pageWidth,
              publicURL,
              readingMode,
              windowHeight,
              windowWidth,
              onPageClick,
            }}
            key={publicURL}
          />
        );
      })}
    </Layout>
  );
}

function Header(props) {
  const { title, hidden, onSettingsButtonClick } = props;
  const headerClassName = classnames(styles.header, {
    [styles.headerHidden]: hidden,
  });

  return (
    <div className={headerClassName}>
      <div className={styles.headerLeftSection}>
        <Link to="/" className={styles.headerBackLink}>
          <Logo className={styles.headerBackIcon} />
        </Link>
        <div>
          <p className={styles.headerTitle}>{title}</p>
        </div>
      </div>
      <div className={styles.headerRightSection}>
        <button className={styles.headerButton} onClick={onSettingsButtonClick}>
          <IconSettings className={styles.headerIcon} />
        </button>
      </div>
    </div>
  );
}

function Page(props) {
  const {
    index,
    pageHeight,
    pageWidth,
    publicURL,
    readingMode,
    windowHeight,
    windowWidth,
    onPageClick,
  } = props;
  const [imageBuffer, setImageBuffer] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const onceRef = useRef(false);
  const { ref, inView } = useInView({
    rootMargin: `${windowHeight * 2.5}px 0px ${windowHeight * 3.5}px`,
  });

  useEffect(() => {
    async function fetchImage() {
      const res = await fetchWithRetries(publicURL, 1000, 5);
      const buffer = await res.arrayBuffer();
      setImageBuffer(decryptBuffer(buffer));
    }
    if (inView && !onceRef.current) {
      fetchImage();
      onceRef.current = true;
    }
  }, [inView]);

  useEffect(() => {
    if (inView) {
      setBlobUrl(createBlobUrl(imageBuffer));
    }

    return () => {
      if (blobUrl != null) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [imageBuffer, inView]);

  const windowRatio = windowHeight / windowWidth;
  const pageRatio = pageHeight / pageWidth;
  const shouldSpanWidth = readingMode !== READING_MODE_HEIGHT;
  const pageClassName = classnames(styles.page, {
    [styles.pageSpanWidth]: shouldSpanWidth,
    [styles.pageSpanHeight]: !shouldSpanWidth,
  });

  return (
    <div
      className={pageClassName}
      id={`page-${index}`}
      ref={ref}
      onClick={(e) => onPageClick(e, index)}
    >
      <div
        className={styles.pageWrapper}
        style={
          !shouldSpanWidth
            ? {
                width:
                  pageRatio < windowRatio ? "100%" : `${100 / pageRatio}vh`,
              }
            : undefined
        }
      >
        {shouldSpanWidth ? (
          <div
            className={styles.pagePadding}
            style={{
              paddingTop: `${pageRatio * 100}%`,
            }}
          />
        ) : null}
        {inView ? (
          <img
            id={`page-image-${index}`}
            className={styles.pageImage}
            src={blobUrl}
          />
        ) : null}
      </div>
    </div>
  );
}

export const pageQuery = graphql`
  query BookByName($name: String!) {
    bookMeta: json(name: { eq: $name }) {
      dimensions
      name
    }
    bookPages: allFile(
      sort: { fields: relativePath }
      filter: {
        relativeDirectory: { eq: $name }
        extension: { nin: ["json"] }
        name: { regex: "/^(?!thumbnail).*/" }
      }
    ) {
      edges {
        node {
          relativePath
          publicURL
          name
        }
      }
    }
  }
`;
