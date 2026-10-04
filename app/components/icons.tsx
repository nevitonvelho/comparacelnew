"use client";
import {
  RiPlayLine,RiPauseLine,RiRefreshLine,
  RiArrowRightUpLine,RiArrowRightDownLine,RiArrowRightLine,RiArrowDownLine,
  RiArrowLeftRightLine,RiCheckLine,RiHeartLine,RiHeartFill,RiBookmarkLine,
  RiBookmarkFill,RiImageLine,RiSearchLine,RiCloseLine,RiAddLine,
  RiCornerDownRightLine,RiEmotionSadLine,RiEmotionHappyLine,RiEmotionLaughLine,
  RiNotification3Line,RiUserLine,RiShareForwardLine,RiDashboardLine,RiBox3Line,RiStore2Line,RiPencilLine,RiUploadCloud2Line,RiShieldKeyholeLine,RiSaveLine,RiBarChartLine,RiEyeLine,RiDeleteBinLine,
} from "@remixicon/react";
const icons={play:RiPlayLine,pause:RiPauseLine,refresh:RiRefreshLine,
  external:RiArrowRightUpLine,downtrend:RiArrowRightDownLine,right:RiArrowRightLine,
  down:RiArrowDownLine,compare:RiArrowLeftRightLine,check:RiCheckLine,
  heart:RiHeartLine,heartFilled:RiHeartFill,bookmark:RiBookmarkLine,
  bookmarkFilled:RiBookmarkFill,image:RiImageLine,search:RiSearchLine,
  close:RiCloseLine,add:RiAddLine,choice:RiCornerDownRightLine,
  sad:RiEmotionSadLine,happy:RiEmotionHappyLine,delighted:RiEmotionLaughLine,
  bell:RiNotification3Line,user:RiUserLine,share:RiShareForwardLine,dashboard:RiDashboardLine,product:RiBox3Line,store:RiStore2Line,edit:RiPencilLine,upload:RiUploadCloud2Line,shield:RiShieldKeyholeLine,save:RiSaveLine,chart:RiBarChartLine,eye:RiEyeLine,remove:RiDeleteBinLine,
};
export function UiIcon({name,className=""}:{name:keyof typeof icons;className?:string}) {
  const Icon=icons[name];
  return <Icon className={`ui-icon ${className}`} aria-hidden="true" focusable="false" data-icon={name} size={18} />;
}
