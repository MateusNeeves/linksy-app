import { useEffect, useRef, useState } from "react";
import axiosAuthInstance from "../../../API/axiosAuthInstance";
import { useNavigate, useParams } from "react-router-dom";
import { MessageProps } from "../../components/SearchMessage/SearchMessageGlobalModel";

const useConversationPage = (model: ConversationPageModel) => {
  const [conversation, setConversation] = useState<ConversationPageModel>(
    model || {}
  );
  const { loggedId, conversationId } = useParams<{
    loggedId: string;
    conversationId: string;
  }>();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchedMessages, setSearchedMessages] = useState<MessageProps[]>([]);
  const [noResults, setNoResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [useEffectFlag, setUseEffectFlag] = useState(0);
  const navigate = useNavigate();

  const fetchConversationMessages = async () => {
    if (loggedId && conversationId) {
      try {
        const response = await axiosAuthInstance.get<ConversationPageModel>(
          `/user/${loggedId}/conversation/${conversationId}`
        );
        setConversation({
          conversation: {
            name: response.data.conversation.name,
            picture: response.data.conversation.picture,
          },
          messages: response.data.messages,
        });
      } catch (error) {
        console.error("Error fetching conversation messages:", error);
        navigate(`/`);
      }
      setUseEffectFlag(1);
    }
  };

  const searchMessages = async (targetWord: string) => {
    try {
      const response = await axiosAuthInstance.get(
        `/user/${loggedId}/conversation/${conversationId}/search`,
        {
          params: { targetWord },
        }
      );

      if (response.data && response.data.length > 0) {
        setSearchedMessages(response.data);
        setNoResults(false);
      } else {
        setSearchedMessages([]);
        setNoResults(true);
      }
    } catch (error) {
      setError("Error searching messages");
      console.error(error);
    }
  };

  const loopSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.trim() === '') {
      setSearchedMessages([]);
      setNoResults(false);
    } else {
      searchMessages(value);
    }
  };

  useEffect(() => {
    if (!useEffectFlag) {
      fetchConversationMessages();
      setTimeout(() => {
        scrollToBottom();
      }, 100); // ajuste o tempo conforme necessário
    }
  }, [useEffectFlag]);

  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
      messageContainerRef.current.scrollHeight;
    }
  };

  const updateMessageArray = () => {
    setUseEffectFlag(0);
  };

  return {
    conversation: conversation.conversation,
    messages: conversation.messages || [],
    loggedId: loggedId,
    conversationId: conversationId,
    noResults,
    loopSearch,
    searchTerm,
    error,
    searchMessages,
    searchedMessages,
    showProfile,
    setShowProfile,
    messageContainerRef,
    updateMessageArray,
    scrollToBottom
  };
};

export default useConversationPage;
