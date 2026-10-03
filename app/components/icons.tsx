"use client";
import {
  RiArrowRightUpLine,RiArrowRightDownLine,RiArrowRightLine,RiArrowDownLine,
  RiArrowLeftRightLine,RiCheckLine,RiHeartLine,RiHeartFill,RiBookmarkLine,
  RiBookmarkFill,RiImageLine,RiSearchLine,RiCloseLine,RiAddLine,
  RiCornerDownRightLine,RiEmotionSadLine,RiEmotionHappyLine,RiEmotionLaughLine,
  RiShareForwardLine,
} from "@remixicon/react";
const icons={
  external:RiArrowRightUpLine,downtrend:RiArrowRightDownLine,right:RiArrowRightLine,
  down:RiArrowDownLine,compare:RiArrowLeftRightLine,check:RiCheckLine,
  heart:RiHeartLine,heartFilled:RiHeartFill,bookmark:RiBookmarkLine,
  bookmarkFilled:RiBookmarkFill,image:RiImageLine,search:RiSearchLine,
  close:RiCloseLine,add:RiAddLine,choice:RiCornerDownRightLine,
  sad:RiEmotionSadLine,happy:RiEmotionHappyLine,delighted:RiEmotionLaughLine,
  share:RiShareForwardLine,
};
export function UiIcon({name,className=""}:{name:keyof typeof icons;className?:string}) {
  const Icon=icons[name];
  return <Icon className={`ui-icon ${className}`} aria-hidden="true" focusable="false" data-icon={name} size={18} />;
}
