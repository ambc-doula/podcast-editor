import os
import uuid
from typing import List, Optional

import feedparser
import requests
from boto3.session import Session
from botocore.exceptions import BotoCoreError, ClientError
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename
from xml.etree import ElementTree as ET

app = Flask(__name__)


class Episode:
    def __init__(
        self,
        title: str,
        description: str,
        link: str,
        published: Optional[str],
        image: Optional[str],
        enclosure_url: Optional[str],
    ):
        self.title = title
        self.description = description
        self.link = link
        self.published = published
        self.image = image
        self.enclosure_url = enclosure_url

    def to_dict(self):
        return {
            "title": self.title,
            "description": self.description,
            "link": self.link,
            "published": self.published,
            "image": self.image,
            "enclosure_url": self.enclosure_url,
        }


class PodcastFeed:
    def __init__(self, title: str, description: str, image: Optional[str], episodes: List[Episode]):
        self.title = title
        self.description = description
        self.image = image
        self.episodes = episodes

    def to_dict(self):
        return {
            "title": self.title,
            "description": self.description,
            "image": self.image,
            "episodes": [ep.to_dict() for ep in self.episodes],
        }


def fetch_feed_content(feed_url: str) -> bytes:
    response = requests.get(feed_url, timeout=10)
    response.raise_for_status()
    return response.content


def parse_feed(content: bytes) -> PodcastFeed:
    parsed = feedparser.parse(content)
    channel = parsed.feed
    episodes: List[Episode] = []

    for entry in parsed.entries:
        enclosure_url = None
        if "enclosures" in entry and entry.enclosures:
            enclosure_url = entry.enclosures[0].get("href")

        image = None
        if "image" in entry:
            image = entry.image.get("href") if isinstance(entry.image, dict) else entry.image
        elif "itunes_image" in entry:
            image = entry.itunes_image.get("href") if isinstance(entry.itunes_image, dict) else entry.itunes_image

        episodes.append(
            Episode(
                title=entry.get("title", "Untitled episode"),
                description=entry.get("summary", ""),
                link=entry.get("link", ""),
                published=entry.get("published"),
                image=image,
                enclosure_url=enclosure_url,
            )
        )

    image = None
    if getattr(channel, "image", None):
        image = channel.image.get("href") if isinstance(channel.image, dict) else channel.image
    elif getattr(channel, "itunes_image", None):
        itunes_image = channel.itunes_image
        image = itunes_image.get("href") if isinstance(itunes_image, dict) else itunes_image

    return PodcastFeed(
        title=channel.get("title", "Untitled podcast"),
        description=channel.get("subtitle") or channel.get("description") or "",
        image=image,
        episodes=episodes,
    )


def generate_rss(feed: PodcastFeed) -> str:
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = feed.title
    ET.SubElement(channel, "description").text = feed.description

    if feed.image:
        image_el = ET.SubElement(channel, "image")
        ET.SubElement(image_el, "url").text = feed.image
        ET.SubElement(image_el, "title").text = feed.title
        ET.SubElement(image_el, "link").text = ""

    for ep in feed.episodes:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = ep.title
        ET.SubElement(item, "description").text = ep.description
        if ep.link:
            ET.SubElement(item, "link").text = ep.link
        if ep.enclosure_url:
            enclosure = ET.SubElement(item, "enclosure")
            enclosure.set("url", ep.enclosure_url)
            enclosure.set("type", "audio/mpeg")

    return ET.tostring(rss, encoding="utf-8", xml_declaration=True).decode("utf-8")


def upload_to_s3(xml_content: str) -> str:
    bucket = os.environ.get("S3_BUCKET_NAME")
    if not bucket:
        raise RuntimeError("S3_BUCKET_NAME environment variable is required to upload the feed")

    object_key = f"feeds/{uuid.uuid4()}.xml"

    session = Session()
    s3 = session.client("s3")
    try:
        s3.put_object(Bucket=bucket, Key=object_key, Body=xml_content.encode("utf-8"), ContentType="application/rss+xml")
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Failed to upload feed: {exc}") from exc

    region = session.region_name or os.environ.get("AWS_REGION") or "us-east-1"
    return f"https://{bucket}.s3.{region}.amazonaws.com/{object_key}"


@app.route("/")
def index():
    return render_template("index.html")


@app.post("/api/load_feed")
def load_feed():
    if "file" in request.files and request.files["file"]:
        uploaded_file = request.files["file"]
        filename = secure_filename(uploaded_file.filename or "feed.xml")
        content = uploaded_file.read()
        if not filename:
            return jsonify({"error": "Invalid file"}), 400
    else:
        data = request.get_json(silent=True) or {}
        feed_url = data.get("url")
        if not feed_url:
            return jsonify({"error": "No feed URL provided"}), 400
        try:
            content = fetch_feed_content(feed_url)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 400

    feed = parse_feed(content)
    return jsonify(feed.to_dict())


@app.post("/api/render_feed")
def render_feed():
    data = request.get_json(force=True)
    title = data.get("title") or "Untitled podcast"
    description = data.get("description") or ""
    episodes_data = data.get("episodes", [])

    episodes: List[Episode] = []
    for ep in episodes_data:
        episodes.append(
            Episode(
                title=ep.get("title", "Untitled episode"),
                description=ep.get("description", ""),
                link=ep.get("link", ""),
                published=ep.get("published"),
                image=ep.get("image"),
                enclosure_url=ep.get("enclosure_url"),
            )
        )

    feed = PodcastFeed(title=title, description=description, image=data.get("image"), episodes=episodes)
    xml_content = generate_rss(feed)

    return jsonify({"feed": feed.to_dict(), "xml": xml_content})


@app.post("/api/upload_feed")
def upload_feed():
    data = request.get_json(force=True)
    xml_content = data.get("xml")
    if not xml_content:
        return jsonify({"error": "No XML provided"}), 400
    try:
        url = upload_to_s3(xml_content)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"url": url})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
