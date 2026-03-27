import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  Avatar,
  Button,
  Input,
  Space,
  Typography,
  Tag,
  Drawer,
  message,
} from "antd";
import {
  PaperClipOutlined,
  GlobalOutlined,
  SendOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;
const { Text } = Typography;

/**
 * 美国手机号格式化工具
 * 将数字字符串转换为 +1 (XXX) XXX-XXXX 格式
 */
const formatUSPhone = (phoneStr) => {
  if (!phoneStr) return "";
  const cleaned = ("" + phoneStr).replace(/\D/g, "");
  const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `+1 (${match[2]}) ${match[3]}-${match[4]}`;
  }
  return phoneStr;
};

const Chat = () => {
  // --- 状态管理 ---
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [draft, setDraft] = useState("");
  const [activeTab, setActiveTab] = useState("全部");
  const [transMode, setTransMode] = useState("原");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isTranslationOn, setIsTranslationOn] = useState(true);
  const [loading, setLoading] = useState(false);

  const msgListRef = useRef(null);
  const statusTags = ["全部", "正常", "冷却", "忙碌", "受限"];

  /**
   * 通用请求助手
   * 增加 Content-Type 检查，防止将 HTML 报错页面解析为 JSON
   */
  const safeFetch = async (url, options = {}) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      const text = await response.text();
      console.error(`期待 JSON 但收到 ${contentType}。内容摘要:`, text.substring(0, 100));
      throw new Error(`服务器未返回 JSON (状态码: ${response.status})。请检查后端 API 路由。`);
    }
  };

  // --- API 调用 ---

  // 获取会话列表
  const fetchConversations = async () => {
    try {
      const url = new URL("/user/chat/conversations", window.location.origin);
      url.searchParams.append("limit", "100");
      const result = await safeFetch(url.toString());
      if (result.code === 0) {
        setConversations(result.data || []);
      } else {
        message.error(result.message || "获取列表失败");
      }
    } catch (err) {
      console.error("获取会话列表异常:", err);
      // 已移除演示数据，异常时列表将保持为空
      setConversations([]);
    }
  };

  // 获取具体聊天记录
  const fetchMessages = async (phone) => {
    if (!phone) return;
    setLoading(true);
    try {
      const url = new URL("/user/chat/messages", window.location.origin);
      url.searchParams.append("peerPhone", phone);
      url.searchParams.append("limit", "50");
      const result = await safeFetch(url.toString());
      if (result.code === 0) {
        setMessages(result.data || []);
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error("获取消息记录异常:", err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!draft.trim() || !selectedChat) return;
    const payload = {
      peerPhone: selectedChat.phone,
      content: draft,
    };
    try {
      const url = new URL("/user/chat/send", window.location.origin);
      const result = await safeFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (result.code === 0) {
        setDraft("");
        fetchMessages(selectedChat.phone);
      } else {
        message.error(result.message || "发送失败");
      }
    } catch (err) {
      message.error("网络异常，发送失败");
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.phone);
    }
  }, [selectedChat]);

  const scrollToBottom = useCallback(() => {
    if (msgListRef.current) {
      msgListRef.current.scrollTo({ top: msgListRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  return (
    <div className="cm-chat-app-container">
      <style>{`
        .cm-chat-app-container {
          background-color: #f7f8fa;
          height: 100vh;
          display: flex;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* 侧边栏样式 */
        .cm-chat-sidebar {
          width: 320px;
          background: #fff;
          border-right: 1px solid #efeff5;
          display: flex;
          flex-direction: column;
          margin: 12px 0 12px 12px;
          border-radius: 12px;
        }

        .cm-sidebar-search-wrap { padding: 16px; border-bottom: 1px solid #f0f0f0; }
        .cm-status-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .cm-status-tag {
          font-size: 11px; padding: 2px 8px; border-radius: 12px;
          cursor: pointer; border: 1px solid #e5e7eb; background: #fff; color: #6b7280;
        }
        .cm-status-tag--active { background: #f3f4f6; color: #111827; border-color: #d1d5db; }

        /* 主聊天区 */
        .cm-chat-pane { flex: 1; display: flex; flex-direction: column; position: relative; }
        
        .cm-chat-header { 
          padding: 8px 24px; 
          display: flex; 
          justify-content: flex-end; 
          align-items: center; 
          border-bottom: 1px solid #f0f0f0; 
          background: #fff; 
          min-height: 48px;
        }

        .cm-thread-stream { flex: 1; padding: 20px 4% 120px 4%; overflow-y: auto; }
        .cm-thread-stream::-webkit-scrollbar { width: 4px; }
        .cm-thread-stream::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }

        .msg-row { display: flex; margin-bottom: 16px; width: 100%; }
        .msg-row-inbound { justify-content: flex-start; }
        .msg-row-outbound { justify-content: flex-end; }
        
        .msg-bubble {
          max-width: 80%; padding: 10px 16px; border-radius: 12px; font-size: 14px;
          line-height: 1.5; position: relative;
        }
        .msg-bubble-inbound { background: #fff; border: 1px solid #e5e7eb; color: #111827; }
        .msg-bubble-outbound { background: #374151; color: #fff; }

        /* 底部输入框 */
        .cm-compose-wrap {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 0 4% 20px 4%;
          background: linear-gradient(to top, #f7f8fa 70%, rgba(247, 248, 250, 0));
        }
        .cm-compose-shell {
          background-color: #ffffff; border: 1px solid #e5e7eb;
          border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); padding: 12px 16px;
        }
        .cm-compose-input { border: none !important; box-shadow: none !important; padding: 0 !important; margin-bottom: 8px !important; font-size: 14px !important; background: transparent !important; resize: none !important; }
        .cm-compose-actions { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #f0f0f0; }

        .action-icon-btn { color: #9ca3af !important; font-size: 16px !important; padding: 4px !important; }
        .action-icon-btn:hover { color: #374151 !important; }
        .send-btn { 
          background: #374151 !important; 
          border: none !important; 
          width: 28px !important; 
          height: 28px !important; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          border-radius: 6px !important; 
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .send-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          cursor: not-allowed !important;
          opacity: 0.7;
        }

        .cm-conv-item { padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #f9fafb; }
        .cm-conv-item:hover { background: #f9fafb; }
        .cm-conv-item--active { background: #f3f4f6; border-left: 3px solid #374151; }
        .cm-phone-display { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: "SF Mono", Menlo, monospace; }
      `}</style>

      {/* 左侧会话列表 */}
      <div className="cm-chat-sidebar">
        <div className="cm-sidebar-search-wrap">
          <Input 
            prefix={<SearchOutlined style={{color: '#9ca3af'}} />} 
            placeholder="搜索手机号 / 备注" 
            variant="filled"
            style={{ borderRadius: '16px', background: '#f3f4f6', border: 'none' }}
          />
          <div className="cm-status-tags">
            {statusTags.map((tag) => (
              <span 
                key={tag} 
                className={`cm-status-tag ${activeTab === tag ? 'cm-status-tag--active' : ''}`}
                onClick={() => setActiveTab(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 ? (
             <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                暂无会话内容
             </div>
          ) : conversations.map(item => (
            <div 
              key={item.phone}
              className={`cm-conv-item ${selectedChat?.phone === item.phone ? 'cm-conv-item--active' : ''}`}
              onClick={() => setSelectedChat(item)}
            >
              <Avatar icon={<UserOutlined />} style={{ background: '#e5e7eb', color: '#9ca3af', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text strong style={{ fontSize: '14px' }}>{item.name || "未命名客户"}</Text>
                    <span className="cm-phone-display">
                      {formatUSPhone(item.phone)}
                    </span>
                  </div>
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {item.last_activity ? new Date(item.last_activity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <Text type="secondary" ellipsis style={{ fontSize: '12px', flex: 1 }}>
                    {item.last_message || "暂无最新消息"}
                  </Text>
                  {item.unread_count > 0 && (
                    <div style={{ background: '#ff4d4f', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '10px', height: '16px', lineHeight: '16px', marginLeft: '8px' }}>
                      {item.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧主面板 */}
      <div className="cm-chat-pane">
        <div className="cm-chat-header">
           <Space size={8}>
              <Button type="text" icon={<ReloadOutlined />} className="action-icon-btn" onClick={fetchConversations} />
              <Button type="text" icon={<SettingOutlined />} className="action-icon-btn" onClick={() => setIsDrawerOpen(true)} />
           </Space>
        </div>

        <div className="cm-thread-stream" ref={msgListRef}>
          {messages.length === 0 && !loading && selectedChat && (
             <div style={{ textAlign: 'center', marginTop: '50px', color: '#9ca3af' }}>暂无消息记录</div>
          )}
          {messages.map((msg) => (
            <div key={msg.id || Math.random()} className={`msg-row msg-row-${msg.direction}`}>
              <div className={`msg-bubble msg-bubble-${msg.direction}`}>
                {msg.media_url && (
                  <img src={msg.media_url} style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '8px', display: 'block' }} alt="媒体内容" />
                )}
                <div>{msg.content}</div>
                <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6, textAlign: 'right' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="cm-compose-wrap">
          <div className="cm-compose-shell">
            <TextArea
              className="cm-compose-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={selectedChat ? "在此输入消息内容..." : "请先从左侧选择一个联系人"}
              autoSize={{ minRows: 1, maxRows: 8 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            
            <div className="cm-compose-actions">
              <Space size={2}>
                <Button type="text" icon={<PaperClipOutlined />} className="action-icon-btn" />
                <Button 
                  type="text" 
                  icon={<GlobalOutlined />} 
                  className={`action-icon-btn ${isTranslationOn ? 'action-icon-btn--active' : ''}`}
                  onClick={() => setIsTranslationOn(!isTranslationOn)}
                />
              </Space>

              <Space size={2} align="center">
                <span className={`action-text-btn ${transMode === '译' ? 'action-text-btn--active' : ''}`} onClick={() => setTransMode('译')}>译</span>
                <div className="cm-action-divider" />
                <span className={`action-text-btn ${transMode === '原' ? 'action-text-btn--active' : ''}`} onClick={() => setTransMode('原')}>原</span>
                <Button 
                  type="primary" 
                  icon={<SendOutlined style={{ fontSize: '12px' }} />} 
                  className="send-btn"
                  style={{ marginLeft: '8px' }}
                  disabled={!draft.trim() || !selectedChat}
                  onClick={handleSend}
                />
              </Space>
            </div>
          </div>
        </div>
      </div>

      <Drawer
        title="联系人详情"
        placement="right"
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        width={350}
      >
        <div style={{ padding: '0 10px' }}>
          {selectedChat ? (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
               <div>
                 <Text type="secondary">姓名</Text>
                 <div><Text strong>{selectedChat.name || "未填写"}</Text></div>
               </div>
               <div>
                 <Text type="secondary">电话 (US)</Text>
                 <div><Text strong>{formatUSPhone(selectedChat.phone)}</Text></div>
               </div>
               <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                 <Text type="secondary">备注信息</Text>
                 <div style={{ marginTop: '8px' }}>暂无详细备注</div>
               </div>
            </Space>
          ) : <div style={{ textAlign: 'center', color: '#9ca3af' }}>请选择一个会话以查看详细信息</div>}
        </div>
      </Drawer>
    </div>
  );
};

export default Chat;
